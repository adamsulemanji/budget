'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files && e.target.files[0];
    if (selected) setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setMessage('');

    try {
      const { uploadUrl, key } = await api.getUploadUrl();

      // Use fetch to PUT the file to the presigned S3 URL. Ensure Content-Type matches what the presign expects.
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/pdf',
        },
        body: file,
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('S3 upload failed:', res.status, text);
        setMessage(`Upload failed: ${res.status} ${res.statusText}`);
      } else {
        setMessage(`Successfully uploaded ${file.name}`);
        // Optionally you can call ingestStatement here or show next steps
        setFile(null);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setMessage('Upload error - see console for details');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-bold mb-4">Budget Tracker</h1>
          <p className="text-gray-600 mb-8">Upload your credit card statement PDF to get started</p>
        </div>

        <div className="w-full max-w-md">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer block"
            >
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-12 w-12" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-sm text-gray-600">
                {file ? file.name : 'Click to upload PDF'}
              </span>
            </label>
          </div>

          {file && (
            <div className="mt-4">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {uploading ? 'Uploading...' : 'Upload PDF'}
              </button>
            </div>
          )}

          {message && (
            <div className={`mt-4 p-3 rounded text-sm ${
              message.includes('Successfully') 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {message}
            </div>
          )}
        </div>

        <div className="text-center sm:text-left">
          <p className="text-sm text-gray-500">
            Your PDF will be processed automatically to extract and categorize transactions.
          </p>
        </div>
      </main>
    </div>
  );
}
