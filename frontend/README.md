# Budget Tracker Frontend

A simple Next.js frontend for uploading PDF statements to the Budget Tracker API.

## Features

- **Simple PDF Upload**: Clean, minimal interface for uploading credit card statements
- **Default Next.js Style**: Uses the standard Next.js styling and layout
- **File Validation**: Ensures only PDF files are uploaded
- **Upload Feedback**: Shows upload progress and success/error messages

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables (optional):
```bash
# Create .env.local file with:
NEXT_PUBLIC_API_URL=https://your-api-gateway-url.amazonaws.com/prod
NEXT_PUBLIC_API_KEY=your-api-key-here
```

3. Start development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Select PDF**: Click the upload area to select a credit card statement PDF
2. **Upload**: Click the "Upload PDF" button to upload the file
3. **Wait**: The file will be processed (currently simulated with a 2-second delay)
4. **Success**: You'll see a success message when the upload is complete

## Project Structure

```
src/
├── app/
│   ├── page.tsx           # Main upload page
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
└── package.json           # Dependencies
```

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run Biome linter
- `npm run format` - Format code with Biome

## Deployment

The frontend can be deployed to:
- Vercel (recommended for Next.js)
- Netlify
- Any static hosting service

### Build for Production

```bash
npm run build
```

The built files will be in the `.next/` directory.

## Integration with Backend

To connect with your Lambda functions:

1. Deploy your infrastructure first
2. Update the environment variables with your API Gateway URL
3. Modify the `handleUpload` function in `src/app/page.tsx` to call your actual API endpoints

## Customization

The upload functionality is currently simulated. To integrate with your actual API:

1. Update the `handleUpload` function to call your `/statements/upload` endpoint
2. Add form fields for statement details (issuer, card last 4 digits)
3. Handle the actual file upload to S3 using presigned URLs
4. Add processing status tracking