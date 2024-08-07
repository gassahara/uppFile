import { Storage } from '@google-cloud/storage';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { createVerify } from 'crypto';
import * as path from 'path';
import { IncomingMessage, ServerResponse } from 'http';
import * as querystring from 'querystring';
import dotenv from 'dotenv';
import { config } from 'dotenv';


// Initialize Google Cloud Storage client
const storage = new Storage();
const bucketName = 'fs0';
const bucket = storage.bucket(bucketName);

async function getPublicKey(): Promise<string> {
  const publicKeyFile = bucket.file('public.pem');
  const [contents] = await publicKeyFile.download();
  return contents.toString();
}

function minus(mins: number): string {
  const current_time = Date.now();
  const new_time = current_time - (mins * 60 * 1000);
  const formatted_time = new Date(new_time).toISOString().slice(0, 16);
  return formatted_time;
}

async function verifySignature(content: string, signature: Buffer, publicKey: string): Promise<boolean> {
  const verifier = createVerify('SHA256');
  verifier.update(content);
  verifier.end();
  return verifier.verify(publicKey, signature);
}

function parseMultipartForm(req: IncomingMessage): Promise<{ fields: any, files: any }> {
  return new Promise((resolve, reject) => {
    const boundary = req.headers['content-type']?.split('boundary=')[1];
    if (!boundary) {
      reject(new Error('No boundary found in content-type header'));
      return;
    }
    let body = '';
    const fields: any = {};
    const files: any = {};
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const parts = body.split(`--${boundary}`);
      parts.forEach((part) => {
        if (part.includes('filename=')) {
          // This is a file
          const filenameMatch = part.match(/filename="(.+)"/);
          if (filenameMatch) {
            const filename = filenameMatch[1];
            const content = part.split('\r\n\r\n')[1].trim();
            const filePath = path.join('/tmp', filename);
            writeFileSync(filePath, content);
            files[filename] = { filepath: filePath };
          }
        } else {
          // This is a field
          const match = part.match(/name="(.+)"/);
          if (match) {
            const fieldName = match[1];
            const fieldValue = part.split('\r\n\r\n')[1].trim();
            fields[fieldName] = fieldValue;
          }
        }
      });
      resolve({ fields, files });
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}

export const handleFileUpload = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'POST') {
    try {
      const { fields, files } = await parseMultipartForm(req);
      if (fields.namo && files['signature'] && fields.datesigned && fields.submit && files['content']) {
        try {
          // Get public key from the bucket
          const publicKey = await getPublicKey();
          const namo = fields.namo as string;
          const namofile = `msgs/${namo}`;
          const namofileSign = `msgs/${namo}`;
          await bucket.upload(files['content'].filepath, { destination: namofile });
          await bucket.upload(files['signature'].filepath, { destination: namofileSign });
          const [contentFileData] = await bucket.file(namofile).download();
          const content = contentFileData.toString();
          const [signatureFileData] = await bucket.file(namofileSign).download();
          const signature = Buffer.from(signatureFileData.toString(), 'base64');
          const okContent = await verifySignature(content, signature, publicKey);
          if (okContent) {
            let ok = false;
            let fecha2 = new Date().toISOString().slice(0, 16);
            let mins = 1;
            while (!ok && mins < 5) {
              ok = await verifySignature(fecha2, Buffer.from(fields.datesigned as string, 'base64'), publicKey);
              fecha2 = minus(mins++);
            }
            if (ok) {
              const filename = `msgs/${fields.namo}`;
              const contentout = Buffer.from(content, 'base64').toString();
              const file = bucket.file(filename);
              await file.save(contentout);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Success, wrote (${content}) to file (${filename})` }));
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Could not decrypt' }));
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Data Mismatch' }));
          }
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        } finally {
          unlinkSync(files['content'].filepath);
          unlinkSync(files['signature'].filepath);
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing Arguments' }));
      }
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  } else {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }
};
