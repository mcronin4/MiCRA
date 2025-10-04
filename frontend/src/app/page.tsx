"use client";

import { useState } from 'react';

export default function Home() {
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('linkedin');

  const handleSend = () => {
    console.log('Sending text:', text, 'for platform:', platform);
    // Add your send logic here
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-gray-800 dark:text-white mb-2">
            MiCRA
          </h1>
          <p className="text-xl text-gray-500 dark:text-gray-400">
            Your Content Repurposing Agent
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <label htmlFor="text-input" className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            Enter your text below
          </label>
          <div className="mt-4 mb-4">
            <span className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">Repurpose for:</span>
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="linkedin"
                  checked={platform === 'linkedin'}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="form-radio h-5 w-5 text-indigo-600"
                />
                <span className="ml-2 text-gray-700 dark:text-gray-300">LinkedIn</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="email"
                  checked={platform === 'email'}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="form-radio h-5 w-5 text-indigo-600"
                />
                <span className="ml-2 text-gray-700 dark:text-gray-300">Email</span>
              </label>
            </div>
          </div>
          <textarea
            id="text-input"
            className="mt-1 block w-full h-64 px-4 py-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
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
        </div>
      </div>
    </div>
  );
}
