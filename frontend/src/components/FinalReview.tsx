"use client";
import React, { useState, useRef, createRef } from 'react';
import Draggable from 'react-draggable';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { Paperclip, Mic, Send } from 'lucide-react';
import LinkedInPost from './parts/LinkedInPost';
import TikTokPost from './parts/TikTokPost';
import EmailDraft from './parts/EmailDraft';
import AddPartMenu from './AddPartMenu';
import ZoomControls from './ZoomControls';

type SourceType = 'Video' | 'Audio' | 'Images' | 'Text';
type Part = {
  id: number;
  type: 'LinkedIn' | 'TikTok' | 'Email';
  position: { x: number; y: number };
};

const FinalReview = () => {
  const [activeTab, setActiveTab] = useState<SourceType>('Video');
  const [parts, setParts] = useState<Part[]>([]);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scale, setScale] = useState(1);
  const nextId = useRef(0);
  const transformState = useRef<ReactZoomPanPinchRef | null>(null);

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

  const handleAddPart = (partType: 'LinkedIn' | 'TikTok' | 'Email') => {
    if (transformState.current) {
      const { scale, positionX, positionY } = transformState.current.state;
      const newPart: Part = {
        id: nextId.current++,
        type: partType,
        position: {
          x: ((menuPosition?.x || 50) + positionX) / scale,
          y: ((menuPosition?.y || 100) + positionY) / scale,
        },
      };
      setParts([...parts, newPart]);
    }
  };

  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.target === e.currentTarget) {
      setMenuPosition({ x: e.clientX, y: e.clientY });
    }
  };


  return (
    <div className="h-screen flex font-sans text-[#1d1d1f] overflow-hidden">
      {/* Left Column: Draggable Canvas */}
      <div
        className="flex-1 h-full relative bg-[#f0f2f5] overflow-hidden"
        style={{
          backgroundImage: 'radial-gradient(#d2d6dc 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      >
        <div className="p-8">
          <h1 className="text-2xl font-bold text-gray-800">Drafts</h1>
        </div>
        <TransformWrapper
          ref={transformState}
          disabled={isDragging}
          onTransformed={(ref, state) => {
            transformState.current = ref;
            setScale(state.scale);
          }}
          minScale={0.2}
          centerOnInit={true}
          centerZoomedOut={true}
        >
          <TransformComponent>
            <div
              style={{ width: '4000px', height: '3000px' }}
              onContextMenu={handleCanvasContextMenu}
              onClick={() => setMenuPosition(null)}
            >
              {parts.map((part) => {
                const Component = {
                  LinkedIn: LinkedInPost,
                  TikTok: TikTokPost,
                  Email: EmailDraft,
                }[part.type];
                const nodeRef = createRef<HTMLDivElement>();

                return (
                  <Draggable
                    key={part.id}
                    nodeRef={nodeRef}
                    defaultPosition={part.position}
                    onStart={() => setIsDragging(true)}
                    onStop={() => setIsDragging(false)}
                  >
                    <div ref={nodeRef}>
                      <Component />
                    </div>
                  </Draggable>
                );
              })}
            </div>
          </TransformComponent>
        </TransformWrapper>

        {menuPosition && (
          <div style={{ position: 'absolute', top: menuPosition.y, left: menuPosition.x }}>
            <AddPartMenu
              onAddPart={handleAddPart}
              onClose={() => setMenuPosition(null)}
            />
          </div>
        )}
        <ZoomControls
          scale={scale}
          onZoomIn={() => transformState.current?.zoomIn()}
          onZoomOut={() => transformState.current?.zoomOut()}
        />
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
