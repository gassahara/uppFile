"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleFileUpload = void 0;
const storage_1 = require("@google-cloud/storage");
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const path = __importStar(require("path"));
// Initialize Google Cloud Storage client
const storage = new storage_1.Storage();
const bucketName = 'fs0';
const bucket = storage.bucket(bucketName);
function getPublicKey() {
    return __awaiter(this, void 0, void 0, function* () {
        const publicKeyFile = bucket.file('public.pem');
        const [contents] = yield publicKeyFile.download();
        return contents.toString();
    });
}
function minus(mins) {
    const current_time = Date.now();
    const new_time = current_time - (mins * 60 * 1000);
    const formatted_time = new Date(new_time).toISOString().slice(0, 16);
    return formatted_time;
}
function verifySignature(content, signature, publicKey) {
    return __awaiter(this, void 0, void 0, function* () {
        const verifier = (0, crypto_1.createVerify)('SHA256');
        verifier.update(content);
        verifier.end();
        return verifier.verify(publicKey, signature);
    });
}
function parseMultipartForm(req) {
    return new Promise((resolve, reject) => {
        var _a;
        const boundary = (_a = req.headers['content-type']) === null || _a === void 0 ? void 0 : _a.split('boundary=')[1];
        if (!boundary) {
            reject(new Error('No boundary found in content-type header'));
            return;
        }
        let body = '';
        const fields = {};
        const files = {};
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
                        (0, fs_1.writeFileSync)(filePath, content);
                        files[filename] = { filepath: filePath };
                    }
                }
                else {
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
const handleFileUpload = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (req.method === 'POST') {
        try {
            const { fields, files } = yield parseMultipartForm(req);
            if (fields.namo && files['signature'] && fields.datesigned && fields.submit && files['content']) {
                try {
                    // Get public key from the bucket
                    const publicKey = yield getPublicKey();
                    const namo = fields.namo;
                    const namofile = `msgs/${namo}.js.js`;
                    const namofileSign = `msgs/${namo}.js.js`;
                    yield bucket.upload(files['content'].filepath, { destination: namofile });
                    yield bucket.upload(files['signature'].filepath, { destination: namofileSign });
                    const [contentFileData] = yield bucket.file(namofile).download();
                    const content = contentFileData.toString();
                    const [signatureFileData] = yield bucket.file(namofileSign).download();
                    const signature = Buffer.from(signatureFileData.toString(), 'base64');
                    const okContent = yield verifySignature(content, signature, publicKey);
                    if (okContent) {
                        let ok = false;
                        let fecha2 = new Date().toISOString().slice(0, 16);
                        let mins = 1;
                        while (!ok && mins < 5) {
                            ok = yield verifySignature(fecha2, Buffer.from(fields.datesigned, 'base64'), publicKey);
                            fecha2 = minus(mins++);
                        }
                        if (ok) {
                            const filename = `msgs/${fields.namo}.js.js`;
                            const contentout = Buffer.from(content, 'base64').toString();
                            const file = bucket.file(filename);
                            yield file.save(contentout);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: `Success, wrote (${content}) to file (${filename})` }));
                        }
                        else {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Could not decrypt' }));
                        }
                    }
                    else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Data Mismatch' }));
                    }
                }
                catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
                finally {
                    (0, fs_1.unlinkSync)(files['content'].filepath);
                    (0, fs_1.unlinkSync)(files['signature'].filepath);
                }
            }
            else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing Arguments' }));
            }
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
    }
    else {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }
});
exports.handleFileUpload = handleFileUpload;
