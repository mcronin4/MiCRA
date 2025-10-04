"use client";

import { useState } from 'react';

export default function Home() {
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('linkedin');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSend = async () => { //async so it's always running
    if (!text.trim()) {
      setMessage('Please enter some text before sending.'); //if we can't trim text, there was nothing sent
      return;
    }

    setIsLoading(true); //sets the state to loading
    setMessage(''); //sets the state to empty string

    try {
      // Generate a unique job ID
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; //generates a unique job ID with date and random number
      
      const response = await fetch('/backend/v1/trigger_job/', { //fetch makes HTTP request to the backend, this variable stores the HTTP resonse, paused operation until complete
        method: 'POST', //Method for sending data to server
        headers: {
          'Content-Type': 'application/json', //Content-Type header for JSON data
        },
        body: JSON.stringify({
          job_id: jobId, //job ID is the unique ID for the job
          text: text
        }),
      });

      if (response.ok) { //if the response is ok, we can set the message and clear the text area
        const data = await response.json(); //data is the response from the backend
        setMessage(data.message); //set the message to the message from the backend
        setText(''); // Clear the text area after successful send
      } else {
        const errorData = await response.json();
        setMessage(`Error: ${errorData.detail || 'Failed to send text'}`); //error
      }
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : 'Failed to connect to server'}`); //error message from the server
    } finally {
      setIsLoading(false); //done loading
    }
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
              disabled={isLoading}
              className="py-3 px-8 border border-transparent rounded-full shadow-sm text-lg font-semibold text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Repurpose'}
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
