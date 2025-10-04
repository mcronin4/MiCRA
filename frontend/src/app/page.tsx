"use client";

import { useState } from 'react';

export default function Home() {
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('linkedin');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSend = () => {
    console.log('Sending text:', text);
    // Add your send logic here
  };

  return (
    <div className="min-h-screen w-full p-4 sm:p-6 lg:p-8">
      <header className="w-full max-w-5xl mx-auto mb-12">
        <h1 className="text-3xl font-bold text-white">MiCRA</h1>
      </header>

      <main className="flex flex-col items-center justify-center">
        <div className="w-full max-w-2xl mx-auto text-center mb-10">
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-3">
            Multi-Modal Content Repurposing Agent
          </h2>
        </div>

        <div className="w-full max-w-2xl mx-auto bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg p-6 sm:p-8 rounded-2xl shadow-lg">
          <div className="mb-6">
            <span className="block text-lg font-medium text-gray-800 mb-4">Repurpose for:</span>
            <div className="flex rounded-lg p-1 bg-white bg-opacity-20">
              <button
                onClick={() => setPlatform('linkedin')}
                className={`w-full text-center py-2 rounded-md transition-colors duration-300 ${
                  platform === 'linkedin' ? 'bg-blue-500 text-white' : 'text-gray-800 hover:bg-white hover:bg-opacity-50'
                }`}
              >
                LinkedIn
              </button>
              <button
                onClick={() => setPlatform('email')}
                className={`w-full text-center py-2 rounded-md transition-colors duration-300 ${
                  platform === 'email' ? 'bg-blue-500 text-white' : 'text-gray-800 hover:bg-white hover:bg-opacity-50'
                }`}
              >
                Email
              </button>
            </div>
          </div>
          <textarea
            id="text-input"
            className="w-full h-64 px-4 py-3 bg-white bg-opacity-10 border-2 border-transparent rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-base text-gray-800 placeholder-gray-500 transition"
            placeholder="Type or paste your text here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
          />
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSend}
              className="py-2 px-6 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-300"
            >
              Send
            </button>
          </div>
          
          {message && (
            <div className={`mt-4 p-4 rounded-md ${
              message.includes('Error') 
                ? 'bg-red-50 border border-red-200 text-red-700' 
                : 'bg-green-50 border border-green-200 text-green-700'
            }`}>
              {message}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
