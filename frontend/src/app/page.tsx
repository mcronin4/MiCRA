"use client";

import { useState } from 'react';

export default function Home() {
  const [text, setText] = useState(''); //Initial state of being empty string
  const [isLoading, setIsLoading] = useState(false); //Initial state of being false
  const [message, setMessage] = useState(''); //Initial state of being empty string

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
              disabled={isLoading}
              className="py-2 px-6 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Send'}
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
      </div>
    </div>
  );
}
