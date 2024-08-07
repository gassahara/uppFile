# File Upload Service

This service provides an endpoint for secure file uploads with digital signature verification.

## Endpoint: File Upload

- **URL**: `/upload` (assumed based on the function name)
- **Method**: POST
- **Content-Type**: multipart/form-data

### Request Parameters

| Field Name | Type | Description |
|------------|------|-------------|
| namo | string | The name or identifier for the file |
| signature | file | The digital signature file |
| datesigned | string | The signed timestamp |
| submit | string | Submit field (presence is checked) |
| content | file | The actual content file to be uploaded |

### Response

- **Success Response**:
  - **Code**: 200
  - **Content**: `{ "error": "Success, wrote (content) to file (filename)" }`

- **Error Responses**:
  - **Code**: 400
    - **Content**: `{ "error": "Missing Arguments" }` (if required fields are missing)
    - **Content**: `{ "error": "Could not decrypt" }` (if signature verification fails)
    - **Content**: `{ "error": "Data Mismatch" }` (if content verification fails)
  - **Code**: 405
    - **Content**: `{ "error": "Method Not Allowed" }` (if not a POST request)
  - **Code**: 500
    - **Content**: `{ "error": "Error message" }` (for any server-side errors)

## Security Features

1. Digital signature verification using a public key stored in Google Cloud Storage.
2. Timestamp verification to ensure the request is recent.
3. Content integrity check using the provided signature.

## Notes

- The service uses Google Cloud Storage for file storage and key management.
- Uploaded files are stored in the `msgs/` directory of the specified bucket.
- The service supports multipart form data for file uploads.
