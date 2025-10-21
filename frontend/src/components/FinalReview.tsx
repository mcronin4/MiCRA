"use client";
import React, { useState, useRef } from 'react';
import Draggable from 'react-draggable';
import { Heart, MessageCircle, Send, Share2, MoreHorizontal, Paperclip, Mic } from 'lucide-react';

type SourceType = 'Video' | 'Audio' | 'Images' | 'Text';

const FinalReview = () => {
  const [activeTab, setActiveTab] = useState<SourceType>('Video');
  const linkedInRef = useRef(null);
  const tiktokRef = useRef(null);
  const emailRef = useRef(null);

  const SourceMediaContent = () => {
    switch (activeTab) {
      case 'Video':
        return (
          <div>
            <div className="bg-gray-800/10 aspect-video mb-4 rounded-lg">
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 text-sm">Media Player</p>
              </div>
            </div>
            <h3 className="font-semibold mb-2 text-sm">Keyframes</h3>
            <div className="flex space-x-2 mb-4">
              <div className="w-24 h-16 bg-gray-800/10 rounded-md"></div>
              <div className="w-24 h-16 bg-gray-800/10 rounded-md"></div>
              <div className="w-24 h-16 bg-gray-800/10 rounded-md"></div>
            </div>
            <h3 className="font-semibold mb-2 text-sm">Transcript</h3>
            <div className="text-xs text-gray-600">
              <p>[00:01] Speaker 1: Hello and welcome...</p>
              <p>[00:05] Speaker 2: Thanks for having me...</p>
            </div>
          </div>
        );
      case 'Audio':
        return (
          <div>
            <div className="bg-gray-800/10 p-4 rounded-lg mb-4">
              <div className="flex items-center justify-center h-24">
                <p className="text-gray-500 text-sm">Audio Player</p>
              </div>
            </div>
            <h3 className="font-semibold mb-2 text-sm">Transcript</h3>
            <div className="text-xs text-gray-600">
              <p>[00:01] Speaker 1: Hello and welcome...</p>
              <p>[00:05] Speaker 2: Thanks for having me...</p>
            </div>
          </div>
        );
      case 'Images':
        return (
          <div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="w-full h-24 bg-gray-800/10 rounded-md"></div>
              <div className="w-full h-24 bg-gray-800/10 rounded-md"></div>
              <div className="w-full h-24 bg-gray-800/10 rounded-md"></div>
              <div className="w-full h-24 bg-gray-800/10 rounded-md"></div>
            </div>
            <h3 className="font-semibold mb-2 text-sm">Captions</h3>
            <div className="text-xs text-gray-600">
              <p>Image 1: A team of developers working together.</p>
              <p>Image 2: Close-up on a line of code.</p>
            </div>
          </div>
        );
      case 'Text':
        return (
          <div>
            <div className="bg-gray-800/5 p-4 rounded-lg mb-4 h-48 overflow-y-auto">
              <p className="text-xs text-gray-700 leading-relaxed">
                This is the full text document. It can be scrolled through to read all the content that has been provided as source material for the generated drafts. This text could be a blog post, an article, a whitepaper, or any other long-form text content.
                <br /><br />
                The system will use this text to extract key points, summarize information, and generate various social media posts and other content formats based on the core message of the document.
              </p>
            </div>
          </div>
        );
      default:
        return <div className="text-sm text-gray-500">Content for {activeTab}</div>;
    }
  };

  return (
    <div className="h-screen flex font-sans text-[#1d1d1f] overflow-hidden">
      {/* Left Column: Draggable Canvas */}
      <div className="flex-1 h-full relative bg-[#f0f2f5]" style={{
        backgroundImage: 'radial-gradient(#d2d6dc 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}>
        <div className="p-8">
          <h1 className="text-2xl font-bold text-gray-800">Drafts</h1>
        </div>

        <Draggable nodeRef={linkedInRef} defaultPosition={{x: 50, y: 100}} bounds="parent">
          <div ref={linkedInRef} className="w-[500px] bg-white p-5 rounded-xl shadow-md cursor-move">
            {/* LinkedIn Post Draft */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                    <div className="w-12 h-12 bg-gray-300 rounded-full mr-3"></div>
                    <div>
                        <p className="font-bold text-sm">MICRA Team</p>
                        <p className="text-xs text-gray-500">Java Technical Lead — MICRA</p>
                        <p className="text-xs text-gray-500">16 h · <span>🌍</span></p>
                    </div>
                </div>
                <MoreHorizontal className="text-gray-500" />
            </div>
            <p className="text-sm mb-4">
            Proud to introduce the brilliant people behind Micra. We're a tight-knit crew of builders, researchers, and problem-solvers obsessed with crafting elegant solutions to complex problems.
            </p>
            <div className="bg-gray-100 rounded-lg p-4">
                <p className="text-center font-semibold text-purple-700 mb-2">MICRA</p>
                <p className="text-center text-xs text-gray-600 mb-4">Meet the Team</p>
                <div className="flex justify-center space-x-4">
                    <div className="w-16 h-16 bg-gray-300 rounded-full"></div>
                    <div className="w-16 h-16 bg-gray-300 rounded-full"></div>
                    <div className="w-16 h-16 bg-gray-300 rounded-full"></div>
                </div>
            </div>
            <div className="flex justify-around text-sm text-gray-600 mt-4 pt-2 border-t">
                <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg"><Share2 size={20}/> <span>Like</span></button>
                <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg"><MessageCircle size={20}/> <span>Comment</span></button>
                <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg"><Share2 size={20}/> <span>Share</span></button>
                <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg"><Send size={20}/> <span>Send</span></button>
            </div>
          </div>
        </Draggable>

        <Draggable nodeRef={tiktokRef} defaultPosition={{x: 600, y: 150}} bounds="parent">
          <div ref={tiktokRef} className="cursor-move w-min">
            {/* TikTok Draft */}
            <div className="bg-black w-64 h-[450px] rounded-3xl p-2 shadow-lg">
                <div className="bg-gray-800 h-full w-full rounded-2xl flex flex-col justify-end items-end p-4 space-y-4">
                    <div className="flex flex-col items-center space-y-1 text-white">
                        <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">+</div>
                    </div>
                    <div className="flex flex-col items-center space-y-1 text-white">
                        <Heart size={32} />
                        <span className="text-xs">1.2M</span>
                    </div>
                    <div className="flex flex-col items-center space-y-1 text-white">
                        <MessageCircle size={32} />
                        <span className="text-xs">40K</span>
                    </div>
                    <div className="flex flex-col items-center space-y-1 text-white">
                        <Share2 size={32} />
                        <span className="text-xs">12K</span>
                    </div>
                </div>
            </div>
          </div>
        </Draggable>

        <Draggable nodeRef={emailRef} defaultPosition={{x: 50, y: 550}} bounds="parent">
          <div ref={emailRef} className="w-[500px] bg-white p-5 rounded-xl shadow-md cursor-move">
            {/* Email Draft */}
            <h3 className="font-semibold mb-3 text-gray-800">Email Draft</h3>
            <div className="border rounded-lg p-4 text-sm">
                <p><span className="font-semibold">Subject: Meet the Team Behind Micra</span></p>
                <br />
                <p>Hi [First Name],</p>
                <br />
                <p>I'm excited to introduce the brilliant people behind Micra a tight-knit crew of builders, researchers, and problem-solvers obsessed with crafting elegant solutions to complex problems.</p>
                <br />
                <p>Best regards,</p>
                <p>[Your Name]</p>
            </div>
          </div>
        </Draggable>
      </div>

      {/* Right Column: Static Sidebar */}
      <div className="w-[450px] h-full bg-white/80 backdrop-blur-lg p-6 shadow-lg overflow-y-auto space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Source Media</h2>
          <div className="flex items-center space-x-4 border-b border-gray-200/80 pb-2 mb-4">
            {([ 'Video', 'Audio', 'Images', 'Text'] as SourceType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 text-sm font-medium transition-colors duration-200 ${
                  activeTab === tab
                    ? 'text-black border-b-2 border-black'
                    : 'text-gray-500 hover:text-black'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div>{SourceMediaContent()}</div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Auto-Checks & Flags</h2>
          <ul className="space-y-4 text-sm">
            <li className="flex justify-between items-center">
              <span className="text-gray-600">Image–text match score</span>
              <span className="font-medium text-gray-900">85%</span>
            </li>
            <li className="flex justify-between items-center">
              <span className="text-gray-600">Proper noun checker</span>
              <span className="text-blue-500 font-medium cursor-pointer">Review</span>
            </li>
            <li className="flex justify-between items-center">
              <span className="text-gray-600">Spell/grammar suggestions</span>
              <span className="font-medium text-gray-900">2 Found</span>
            </li>
            <li className="space-y-2">
              <span className="text-gray-600">Platform-limit meter</span>
              <div className="w-full bg-gray-200/70 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: '45%' }}></div>
              </div>
            </li>
            <li className="space-y-2">
              <span className="text-gray-600">Risks</span>
              <div className="flex flex-wrap gap-2">
                <span className="bg-yellow-400/30 text-yellow-900 text-xs font-medium px-2.5 py-1 rounded-full">
                  Brand Reputation
                </span>
              </div>
            </li>
          </ul>
        </div>

        <div>
          <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex-shrink-0"></div>
              <div className="flex-1">
                  <div className="bg-gray-100 p-3 rounded-lg">
                      <p className="text-sm">Can use a professional tone instead for the posts?</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">You · 02:22 AM</p>
              </div>
          </div>
          <div className="mt-4 relative">
              <input type="text" placeholder="Message MICRAi..." className="w-full pl-10 pr-20 py-2 border rounded-full bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <Paperclip className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                  <Mic className="text-gray-400 cursor-pointer" size={20} />
                  <button className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center">
                      <Send size={16} className="-ml-0.5" />
                  </button>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinalReview;
