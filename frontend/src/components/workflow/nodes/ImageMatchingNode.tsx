'use client'

import React, { useState, useRef, useEffect } from 'react'
import { NodeProps } from '@xyflow/react'
import { WorkflowNodeWrapper } from '../WorkflowNodeWrapper'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import { matchImagesToText, fileToBase64, ImageWithId, ImageMatchResult } from '@/lib/fastapi/image-matching'
import { NodeConfig } from '@/types/workflow'
import { X, Upload, ImagePlus, RefreshCw, AlertCircle } from 'lucide-react'

// Config for this node type
const config: NodeConfig = {
  type: 'image-matching',
  label: 'Image-Text Matching',
  description: 'Match images with text using VLM',
  inputs: [
    { id: 'images', label: 'Images', type: 'image[]' },
    { id: 'text', label: 'Text', type: 'string' }
  ],
  outputs: [
    { id: 'matches', label: 'Results', type: 'json' }
  ]
}

export function ImageMatchingNode({ id }: NodeProps) {
  // Get the node from the Zustand state manager
  const node = useWorkflowStore(state => state.nodes[id])
  const updateNode = useWorkflowStore(state => state.updateNode)

  // If there are already inputs associated with the node, use them as initial state
  const initialText = node?.inputs?.text || '';
  const initialImagesRaw = node?.inputs?.images || [];
  
  // Convert legacy string[] to ImageWithId[] if needed
  const initialImages: ImageWithId[] = initialImagesRaw.length > 0 && typeof initialImagesRaw[0] === 'string'
    ? initialImagesRaw.map((img: string, idx: number) => ({ 
        id: `img-${Date.now()}-${idx}`, 
        base64: img 
      }))
    : initialImagesRaw as ImageWithId[];

  const [text, setText] = useState(initialText)
  const [images, setImages] = useState<ImageWithId[]>(initialImages)
  const [imageResults, setImageResults] = useState<Map<string, ImageMatchResult>>(new Map())

  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Syncing to Zustand store
  useEffect(() => {
    // prevent unnecessary changes if nothing changed
    if (node && (node.inputs.text != text || JSON.stringify(node.inputs.images) !== JSON.stringify(images))) {
      updateNode(id, {
        inputs: {
          ...node.inputs,
          text: text,
          images: images
        }
      })
    }
  }, [text, images, id, updateNode, node])
  


  
  const processFiles = async (fileList: FileList | File[]) => {
    // We convert files to base64 immediately, rather than keeping a base64 and the raw file
    const newFiles = Array.from(fileList)
    const newImages: ImageWithId[] = await Promise.all(
      newFiles.map(async (f) => ({
        id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        base64: await fileToBase64(f)
      }))
    );
    setImages(prev => [...prev, ...newImages])
  }
  
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files)
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set to false if we're leaving the drop zone itself, not a child element
    if (e.currentTarget === e.target) {
      setIsDragging(false)
    }
  }
  
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    const droppedFiles = e.dataTransfer.files
    if (droppedFiles.length > 0) {
      await processFiles(droppedFiles)
    }
  }
  
  const handleClick = () => {
    fileInputRef.current?.click()
  }
  
  const removeImage = (imageId: string) => {
    setImages(prev => prev.filter(img => img.id !== imageId))
    setImageResults(prev => {
      const next = new Map(prev)
      next.delete(imageId)
      return next
    })
  }

  const retryImage = async (imageId: string) => {
    const image = images.find(img => img.id === imageId)
    if (!image) return

    setImageResults(prev => {
      const next = new Map(prev)
      next.set(imageId, { image_id: imageId, status: 'failed', error: 'Retrying...' })
      return next
    })

    try {
      const response = await matchImagesToText([image], text)
      if (response.success && response.results.length > 0) {
        setImageResults(prev => {
          const next = new Map(prev)
          next.set(imageId, response.results[0])
          return next
        })
      }
    } catch (error: any) {
      setImageResults(prev => {
        const next = new Map(prev)
        next.set(imageId, { image_id: imageId, status: 'failed', error: error.message })
        return next
      })
    }
  }
  
  const handleExecute = async () => {
    updateNode(id, { status: 'running', error: undefined })
    setImageResults(new Map())
    
    try {
      if (images.length === 0) throw new Error('No images uploaded')
      if (!text.trim()) throw new Error('No text entered')
            
      // Call API
      const response = await matchImagesToText(images, text)
      
      if (!response.success) {
        throw new Error(response.error || 'Matching failed')
      }
      
      // Store results by image ID
      const resultsMap = new Map<string, ImageMatchResult>()
      response.results.forEach(result => {
        resultsMap.set(result.image_id, result)
      })
      setImageResults(resultsMap)
      
      // Update node
      updateNode(id, { 
        status: 'completed',
        outputs: { results: response.results },
        inputs: { images: images, text }
      })
    } catch (error: any) {
      updateNode(id, { status: 'error', error: error.message })
    }
  }
  
  return (
    <WorkflowNodeWrapper nodeId={id} config={config} onExecute={handleExecute}>
      <div className="space-y-3">
        {/* Text input */}
        <div>
          <label className="text-xs text-gray-600 block mb-1">Text Description</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter text to match..."
            className="nodrag w-full px-2 py-1.5 text-sm border rounded resize-none"
            rows={3}
          />
        </div>
        
        {/* Image upload - Drag and Drop Zone */}
        <div>
          <label className="text-xs text-gray-600 block mb-1">
            Images ({images.length})
          </label>
          
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />
          
          {/* Drop zone */}
          <div
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              nodrag relative w-full border-2 border-dashed rounded-lg transition-all duration-200 cursor-pointer
              ${isDragging 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
              }
              ${images.length > 0 ? 'p-3' : 'p-6'}
            `}
          >
            {images.length === 0 ? (
              // Empty state
              <div className="flex flex-col items-center justify-center text-center">
                <div className={`
                  mb-2 transition-colors duration-200
                  ${isDragging ? 'text-blue-500' : 'text-gray-400'}
                `}>
                  <Upload size={32} />
                </div>
                <p className={`
                  text-sm font-medium mb-1
                  ${isDragging ? 'text-blue-600' : 'text-gray-700'}
                `}>
                  {isDragging ? 'Drop images here' : 'Drag & drop images here'}
                </p>
                <p className="text-xs text-gray-500">
                  or click to browse
                </p>
              </div>
            ) : (
              // Has images state
              <>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {images.map((image) => {
                    const result = imageResults.get(image.id)
                    const isRunning = node?.status === 'running' && !result
                    
                    return (
                      <div 
                        key={image.id} 
                        className="relative group"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <img 
                          src={image.base64} 
                          alt={`Preview ${image.id}`}
                          className={`w-full h-16 object-cover rounded border ${
                            result?.status === 'failed' ? 'opacity-50' : ''
                          }`}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeImage(image.id)
                          }}
                          className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remove image"
                        >
                          <X size={12} />
                        </button>
                        
                        {/* Status overlay */}
                        {isRunning && (
                          <div className="absolute inset-0 bg-black bg-opacity-30 rounded flex items-center justify-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          </div>
                        )}
                        
                        {/* Result badge */}
                        {result && (
                          <div className={`absolute bottom-0 left-0 right-0 text-xs px-1 py-0.5 rounded-b ${
                            result.status === 'success' 
                              ? 'bg-green-500 text-white' 
                              : 'bg-red-500 text-white'
                          }`}>
                            {result.status === 'success' ? (
                              <span>{(result.combined_score! * 100).toFixed(0)}%</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <AlertCircle size={10} />
                                <span className="truncate">{result.error || 'Failed'}</span>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Retry button for failed images */}
                        {result?.status === 'failed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              retryImage(image.id)
                            }}
                            className="absolute top-0 left-0 bg-blue-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Retry image"
                            title="Retry analysis"
                          >
                            <RefreshCw size={10} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className={`
                  flex items-center justify-center gap-1 text-xs pt-2 border-t border-gray-200
                  ${isDragging ? 'text-blue-600' : 'text-gray-500'}
                `}>
                  <ImagePlus size={14} />
                  <span>
                    {isDragging ? 'Drop to add more' : 'Click or drag to add more images'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        
      </div>
    </WorkflowNodeWrapper>
  )
}

