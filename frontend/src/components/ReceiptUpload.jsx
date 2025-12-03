import React, { useState } from 'react';
import { Upload, FileText, AlertCircle, Check, Loader } from 'lucide-react';
import api from '../services/api';

const ReceiptUpload = ({ onReceiptParsed }) => {
  const [receiptText, setReceiptText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [uploadMode, setUploadMode] = useState('file'); // 'text' or 'file' - default to file

  // Handle text input
  const handleTextChange = (e) => {
    setReceiptText(e.target.value);
    setError(null);
  };

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Check file type - accept images and text files
      const allowedTypes = ['text/plain', 'text/markdown', 'image/jpeg', 'image/jpg', 'image/png'];
      const isImage = selectedFile.type.startsWith('image/');
      const isText = selectedFile.name.match(/\.(txt|md)$/i);

      if (!allowedTypes.includes(selectedFile.type) && !isText && !isImage) {
        setError('Please upload an image (.jpg, .png) or text file (.txt, .md)');
        return;
      }

      setFile(selectedFile);
      setError(null);

      // Read file content to display preview (only for text files)
      if (isText || selectedFile.type === 'text/plain' || selectedFile.type === 'text/markdown') {
        const reader = new FileReader();
        reader.onload = (event) => {
          setReceiptText(event.target.result);
        };
        reader.readAsText(selectedFile);
      } else if (isImage) {
        setReceiptText('Image file selected - will be processed with OCR');
      }
    }
  };

  // Handle drag and drop
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileChange({ target: { files: [droppedFile] } });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Upload and parse receipt
  const handleUpload = async () => {
    // For images, we need the file, for text we need receiptText
    if (!file && !receiptText.trim()) {
      setError('Please enter or upload receipt text/image');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      // Step 1: Upload receipt
      let uploadResponse;

      if (file) {
        // Send as FormData for file upload
        const formData = new FormData();
        formData.append('receipt', file);
        formData.append('userId', 'demo_user');

        uploadResponse = await api.post('/receipts/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } else {
        // Send as JSON for text input
        uploadResponse = await api.post('/receipts/upload', {
          text: receiptText,
          userId: 'demo_user',
        });
      }

      const uploadData = uploadResponse.data;
      const receiptId = uploadData.receiptId;

      setSuccess(`Receipt uploaded! Processing...`);

      // Step 2: Parse receipt
      const parseResponse = await api.post(`/receipts/${receiptId}/parse`, {
        use_llm: true, // Enable LLM parsing
        min_confidence: 0.5,
        filter_non_grocery: true,
      });

      const parseData = parseResponse.data;

      // Backend returns { receipt: { items, stats, ... }, receiptId, status }
      const receiptData = parseData.receipt || parseData;

      setSuccess(`Parsed ${receiptData.items.length} items successfully!`);

      // Notify parent component with parsed data
      if (onReceiptParsed) {
        onReceiptParsed({
          receiptId,
          items: receiptData.items,
          needsReview: receiptData.needsReview,
          stats: receiptData.stats,
          metadata: uploadData.metadata,
          rawText: uploadData.raw_text || receiptText,
        });
      }

      // Clear form
      setTimeout(() => {
        setReceiptText('');
        setFile(null);
        setSuccess(null);
      }, 2000);

    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to process receipt');
      console.error('Error processing receipt:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-6">
        <Upload className="w-5 h-5 text-grapefruit-500" />
        <h3 className="text-lg font-semibold text-gray-900">Upload Receipt</h3>
      </div>

      {/* Upload Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setUploadMode('file')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            uploadMode === 'file'
              ? 'bg-grapefruit-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Upload className="w-4 h-4 inline mr-1" />
          Upload File
        </button>
        <button
          onClick={() => setUploadMode('text')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            uploadMode === 'text'
              ? 'bg-grapefruit-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <FileText className="w-4 h-4 inline mr-1" />
          Paste Text
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <Check className="w-5 h-5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Text Input Mode */}
      {uploadMode === 'text' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Receipt Text
          </label>
          <textarea
            value={receiptText}
            onChange={handleTextChange}
            placeholder="Paste your receipt text here..."
            rows={12}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-grapefruit-500 focus:border-transparent font-mono text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Copy and paste receipt text from your email or PDF
          </p>
        </div>
      )}

      {/* File Upload Mode */}
      {uploadMode === 'file' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload File (images or text)
          </label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-grapefruit-500 transition-colors cursor-pointer"
          >
            <input
              type="file"
              accept=".txt,.md,.jpg,.jpeg,.png,text/plain,text/markdown,image/jpeg,image/png"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <p className="text-sm text-gray-600">
                {file ? (
                  <span className="font-medium text-grapefruit-600">{file.name}</span>
                ) : (
                  <>
                    <span className="font-medium text-grapefruit-600">Click to upload</span>
                    {' or drag and drop'}
                  </>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Images (JPG, PNG) or text files (TXT, MD)
              </p>
            </label>
          </div>
          
          {/* File Preview */}
          {receiptText && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preview
              </label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                  {receiptText}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={loading || !receiptText.trim()}
        className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
          loading || !receiptText.trim()
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-grapefruit-500 text-white hover:bg-grapefruit-600'
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader className="w-5 h-5 animate-spin" />
            Processing Receipt...
          </span>
        ) : (
          'Parse Receipt'
        )}
      </button>

      {/* Info Box */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> For best results, use receipt text files from your examples folder
          or copy-paste from email confirmations.
        </p>
      </div>
    </div>
  );
};

export default ReceiptUpload;
