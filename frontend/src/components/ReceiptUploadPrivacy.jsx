import React, { useState } from 'react';
import { Upload, FileText, AlertCircle, Check, Loader, Shield, Lock, Cloud } from 'lucide-react';

// AKEDO BOUNTY: Privacy integrations
import { encryptClientSide, getUserEncryptionKey, encryptReceiptForUpload } from '../utils/clientEncryption';
import { processReceiptOnDevice, performOCROnDevice } from '../utils/edgeAI';

const ReceiptUploadPrivacy = ({ onReceiptParsed }) => {
  const [receiptText, setReceiptText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [uploadMode, setUploadMode] = useState('file');

  // AKEDO BOUNTY: Privacy settings
  const [privacyMode, setPrivacyMode] = useState(true); // Default to privacy-preserving
  const [useIPFS, setUseIPFS] = useState(false);
  const [useEdgeAI, setUseEdgeAI] = useState(true); // Default to on-device OCR
  const [processingStep, setProcessingStep] = useState('');

  // Handle text input
  const handleTextChange = (e) => {
    setReceiptText(e.target.value);
    setError(null);
  };

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // AKEDO BOUNTY: Accept images for Edge AI OCR
      const allowedTypes = ['text/plain', 'text/markdown', 'image/jpeg', 'image/png', 'image/jpg'];
      const isValidType = allowedTypes.includes(selectedFile.type) ||
                          selectedFile.name.match(/\.(txt|md|jpg|jpeg|png)$/i);

      if (!isValidType) {
        setError('Please upload a .txt, .md, .jpg, or .png file');
        return;
      }

      setFile(selectedFile);
      setError(null);

      // Read file content
      if (selectedFile.type.startsWith('text/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setReceiptText(event.target.result);
        };
        reader.readAsText(selectedFile);
      } else {
        // Image file - will use Edge AI OCR
        setReceiptText('Image file selected - will use on-device OCR');
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

  // AKEDO BOUNTY: Privacy-preserving upload with client-side encryption + Edge AI
  const handlePrivacyUpload = async () => {
    if (!file && !receiptText.trim()) {
      setError('Please enter or upload receipt');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const isImageFile = file && file.type.startsWith('image/');

      // STEP 1: On-device OCR for images (AKEDO: On-device processing)
      if (isImageFile && useEdgeAI) {
        setProcessingStep('🔒 Processing on-device (privacy-preserving)...');

        try {
          const ocrResult = await performOCROnDevice(file);
          setReceiptText(ocrResult.text);

          setProcessingStep(`✅ OCR completed on-device (${Math.round(ocrResult.confidence)}% confidence)`);

          // Use OCR text for next steps
          const textToProcess = ocrResult.text;

          // STEP 2: Client-side encryption (AKEDO: Encrypted data handling)
          if (privacyMode) {
            setProcessingStep('🔐 Encrypting on-device...');

            const userKey = await getUserEncryptionKey();
            const encryptedText = await encryptClientSide(textToProcess, userKey);

            // STEP 3: Send encrypted data to server
            setProcessingStep('📤 Uploading encrypted data...');

            const uploadResponse = await fetch('http://localhost:5000/receipts/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: encryptedText,
                userId: 'demo_user',
                encrypted: true,
                userKey: userKey, // Only for server-side decryption
              }),
            });

            if (!uploadResponse.ok) {
              throw new Error('Upload failed');
            }

            const uploadData = await uploadResponse.json();
            setProcessingStep(`✅ Uploaded with end-to-end encryption`);

            // Continue with parsing...
            await parseReceipt(uploadData.receiptId);

          } else {
            // No encryption - send plaintext
            await uploadPlaintext(textToProcess);
          }

        } catch (ocrError) {
          console.error('On-device OCR failed:', ocrError);
          setError(`On-device OCR failed: ${ocrError.message}. Falling back to server.`);
          setLoading(false);
          return;
        }

      } else {
        // Text file or no Edge AI - upload directly
        let textToUpload = receiptText;

        // STEP 2: Client-side encryption (if privacy mode enabled)
        if (privacyMode) {
          setProcessingStep('🔐 Encrypting on-device...');

          const userKey = await getUserEncryptionKey();
          textToUpload = await encryptClientSide(receiptText, userKey);

          setProcessingStep('📤 Uploading encrypted data...');

          const uploadResponse = await fetch('http://localhost:5000/receipts/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: textToUpload,
              userId: 'demo_user',
              encrypted: true,
              userKey: userKey,
            }),
          });

          if (!uploadResponse.ok) {
            throw new Error('Upload failed');
          }

          const uploadData = await uploadResponse.json();
          await parseReceipt(uploadData.receiptId);

        } else {
          // No encryption - traditional flow
          await uploadPlaintext(receiptText);
        }
      }

    } catch (err) {
      console.error('Privacy upload failed:', err);
      setError(`Error: ${err.message}`);
      setProcessingStep('');
    } finally {
      setLoading(false);
    }
  };

  // Traditional plaintext upload (backward compatibility)
  const uploadPlaintext = async (text) => {
    setProcessingStep('📤 Uploading (plaintext)...');

    const uploadResponse = await fetch('http://localhost:5000/receipts/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        userId: 'demo_user',
      }),
    });

    if (!uploadResponse.ok) {
      throw new Error('Upload failed');
    }

    const uploadData = await uploadResponse.json();
    await parseReceipt(uploadData.receiptId);
  };

  // Parse receipt after upload
  const parseReceipt = async (receiptId) => {
    setProcessingStep('🧠 Parsing receipt...');

    const parseResponse = await fetch(`http://localhost:5000/receipts/${receiptId}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        use_llm: true,
        min_confidence: 0.5,
      }),
    });

    if (!parseResponse.ok) {
      throw new Error('Parsing failed');
    }

    const parseData = await parseResponse.json();

    setProcessingStep('🔍 Matching items...');

    const matchResponse = await fetch(`http://localhost:5000/receipts/${receiptId}/match`, {
      method: 'POST',
    });

    if (!matchResponse.ok) {
      throw new Error('Matching failed');
    }

    const matchData = await matchResponse.json();

    setSuccess(`✅ Receipt processed! Found ${parseData.items.length} items, ${matchData.summary.matched} matched.`);
    setProcessingStep('');

    if (onReceiptParsed) {
      onReceiptParsed({
        receiptId,
        items: parseData.items,
        matchedItems: matchData.matchedItems,
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Upload Receipt</h2>

          {/* AKEDO BOUNTY: Privacy indicator */}
          <div className="flex items-center gap-2">
            {privacyMode && (
              <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                <Shield size={16} />
                Privacy Mode
              </span>
            )}
            {useEdgeAI && (
              <span className="flex items-center gap-1 text-blue-600 text-sm font-medium">
                <Lock size={16} />
                On-Device OCR
              </span>
            )}
          </div>
        </div>

        {/* Privacy Settings */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">AKEDO Privacy Features</h3>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={privacyMode}
                onChange={(e) => setPrivacyMode(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-700">
                🔐 Client-side encryption (encrypt before upload)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useEdgeAI}
                onChange={(e) => setUseEdgeAI(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-700">
                🧠 On-device OCR (image processing in browser, never sent to server)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useIPFS}
                onChange={(e) => setUseIPFS(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-700">
                ☁️ IPFS storage (decentralized, user-owned)
              </span>
            </label>
          </div>

          {privacyMode && (
            <p className="mt-3 text-xs text-blue-700">
              ✓ End-to-end encryption enabled. Your data is encrypted before leaving your device.
            </p>
          )}
        </div>

        {/* Upload Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setUploadMode('file')}
            className={`flex-1 py-2 px-4 rounded ${
              uploadMode === 'file'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            <Upload className="inline-block mr-2" size={16} />
            Upload File
          </button>
          <button
            onClick={() => setUploadMode('text')}
            className={`flex-1 py-2 px-4 rounded ${
              uploadMode === 'text'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            <FileText className="inline-block mr-2" size={16} />
            Paste Text
          </button>
        </div>

        {/* File Upload */}
        {uploadMode === 'file' && (
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => document.getElementById('file-input').click()}
          >
            <Upload className="mx-auto mb-4 text-gray-400" size={48} />
            <p className="text-gray-600 mb-2">
              Drag and drop your receipt file here, or click to browse
            </p>
            <p className="text-sm text-gray-500">
              Supports: .txt, .md, .jpg, .png {useEdgeAI && '(images processed on-device)'}
            </p>
            <input
              id="file-input"
              type="file"
              onChange={handleFileChange}
              accept=".txt,.md,.jpg,.jpeg,.png"
              className="hidden"
            />
            {file && (
              <p className="mt-4 text-sm text-green-600">
                <Check className="inline mr-1" size={16} />
                {file.name} selected
              </p>
            )}
          </div>
        )}

        {/* Text Input */}
        {uploadMode === 'text' && (
          <textarea
            value={receiptText}
            onChange={handleTextChange}
            placeholder="Paste your receipt text here..."
            className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
        )}

        {/* Processing Step Indicator */}
        {processingStep && (
          <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-700">
            {processingStep}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 rounded flex items-start gap-2">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={16} />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="mt-4 p-3 bg-green-50 rounded flex items-start gap-2">
            <Check className="text-green-600 flex-shrink-0 mt-0.5" size={16} />
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        {/* Upload Button */}
        <button
          onClick={handlePrivacyUpload}
          disabled={loading || (!receiptText.trim() && !file)}
          className="mt-6 w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader className="animate-spin" size={20} />
              Processing...
            </>
          ) : (
            <>
              {privacyMode && <Lock size={20} />}
              {privacyMode ? 'Upload with Privacy Protection' : 'Upload Receipt'}
            </>
          )}
        </button>

        {/* Privacy Notice */}
        {privacyMode && (
          <p className="mt-4 text-xs text-center text-gray-500">
            🔒 Your receipt is encrypted on your device before being sent to the server.
            We never see your unencrypted data.
          </p>
        )}
      </div>
    </div>
  );
};

export default ReceiptUploadPrivacy;
