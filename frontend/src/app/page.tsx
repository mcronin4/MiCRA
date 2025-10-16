"use client";

import { useState, useEffect } from 'react';

export default function Home() {
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('linkedin');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [repurposedContent, setRepurposedContent] = useState('');
  const [showCopyNotification, setShowCopyNotification] = useState(false);
  const [currentPhrase, setCurrentPhrase] = useState(0);

  const loadingPhrases = [
    "🤖 Agent munching the data...",
    "🤖 Agent crushing it up...",
    "🤖 Agent digesting content...",
    "🤖 Agent processing neural networks...",
    "🤖 Agent transforming text...",
    "🤖 Agent optimizing for platform...",
    "🤖 Agent adding finishing touches...",
    "🤖 Agent almost done..."
  ];

  // Cycle through loading phrases during loading
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setCurrentPhrase(prev => (prev + 1) % loadingPhrases.length);
      }, 1500); // Change every 1.5 seconds

      return () => clearInterval(interval);
    } else {
      setCurrentPhrase(0); // Reset when not loading
    }
  }, [isLoading, loadingPhrases.length]);

  const copyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setShowCopyNotification(true);
      setTimeout(() => setShowCopyNotification(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

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
          text: text,
          platform: platform
        }),
      });

      if (response.ok) { //if the response is ok, we can set the message and clear the text area
        const data = await response.json(); //data is the response from the backend
        setRepurposedContent(data.message); // Store the generated content
        setMessage('Content successfully repurposed!'); //set the message to the message from the backend
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
        <h1 className="text-3xl font-bold text-[#1d1d1f]">MiCRA</h1>
      </header>

      <main className="flex flex-col items-center justify-center">
        <div className="w-full max-w-2xl mx-auto text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-black via-[#BA59A9] to-[#674FE3] mb-3 tracking-tight pb-2">
            Multi-Modal Content Repurposing Agent
          </h2>
          <p className="text-lg text-[#6e6e73] max-w-xl mx-auto">
            Transform your content across platforms with AI-powered intelligence
          </p>
        </div>

        <div className="w-full max-w-2xl mx-auto bg-white p-8 sm:p-10 rounded-[28px] shadow-2xl border border-gray-200 relative overflow-hidden">
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-[#1d1d1f] mb-6">Choose Platform</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPlatform('linkedin')}
                className={`p-4 rounded-xl border-2 transition-all duration-300 text-center ${
                  platform === 'linkedin'
                    ? 'border-[#0071e3] bg-[#0071e3] text-white shadow-lg'
                    : 'border-gray-300 bg-gray-50 text-gray-700 hover:border-gray-400 hover:bg-gray-100'
                }`}
              >
                <span className="font-medium text-sm">LinkedIn</span>
              </button>
              <button
                onClick={() => setPlatform('email')}
                className={`p-4 rounded-xl border-2 transition-all duration-300 text-center ${
                  platform === 'email'
                    ? 'border-[#0071e3] bg-[#0071e3] text-white shadow-lg'
                    : 'border-gray-300 bg-gray-50 text-gray-700 hover:border-gray-400 hover:bg-gray-100'
                }`}
              >
                <span className="font-medium text-sm">Email</span>
              </button>
            </div>
          </div>
          <div className="mb-8">
            <label
              htmlFor="text-input"
              className="block text-sm font-medium text-[#1d1d1f] mb-3"
            >
              Content to Repurpose
            </label>
            <textarea
              id="text-input"
              className="w-full h-64 px-5 py-4 bg-gray-50 border border-gray-300 rounded-xl text-base text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:border-transparent transition-all duration-200 resize-none"
              placeholder="Paste your content here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSend}
              disabled={isLoading}
              className="px-8 py-3 bg-[#0071e3] text-white rounded-xl font-medium text-base hover:bg-[#0077ed] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px]"
            >
              {isLoading ? 'Repurposing...' : 'Repurpose Content'}
            </button>
          </div>

          {message && (
            <div className={`mt-4 p-4 rounded-lg ${
              message.includes('Error')
                ? 'bg-red-50 border border-red-200 text-red-700'
                : 'bg-green-50 border border-green-200 text-green-700'
            }`}>
              <p className="text-sm">{message}</p>
            </div>
          )}

          {repurposedContent && (
            <div className="mt-10">
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[#1d1d1f]">
                    {platform === 'linkedin' ? 'LinkedIn Post' : 'Email Draft'}
                  </h3>
                  <button
                    onClick={() => copyToClipboard(repurposedContent)}
                    className="px-4 py-2 bg-[#0071e3] text-white rounded-lg hover:bg-[#0077ed] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:ring-offset-2 transition-all duration-200 text-sm font-medium"
                  >
                    Copy Content
                  </button>
                </div>
                <div className="bg-white p-6">
                  <pre className="text-[#1d1d1f] whitespace-pre-wrap text-sm leading-relaxed font-normal">
                    {repurposedContent}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {showCopyNotification && (
            <div className="fixed top-20 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in">
              Copied to clipboard!
            </div>
          )}

          {isLoading && (
            <div className="absolute top-0 left-0 w-full h-full bg-white bg-opacity-95 backdrop-filter backdrop-blur-sm flex flex-col items-center justify-center rounded-[28px] z-10">
              <div className="text-center">
                <div className="mb-6">
                  <div className="w-12 h-12 border-4 border-[#0071e3] border-t-transparent rounded-full animate-spin mx-auto"></div>
                </div>
                <p className="text-[#1d1d1f] text-xl font-semibold mb-3">Repurposing Content</p>
                <p className="text-[#6e6e73] text-base mb-8 h-6 flex items-center justify-center font-medium">
                  {loadingPhrases[currentPhrase]}
                </p>

                {/* Progress bar */}
                <div className="w-64 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-[#0071e3] h-2 rounded-full animate-pulse" style={{
                    width: '70%',
                    animation: 'loading-bar 2s ease-in-out infinite alternate'
                  }}></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
