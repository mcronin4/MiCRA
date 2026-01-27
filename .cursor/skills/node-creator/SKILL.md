---
name: node-creator
description: Create new workflow nodes for the MiCRA system. Use when the user wants to add a new node type, create workflow components, implement new node functionality, build a node, make a node, or add workflow functionality. Covers frontend React components, Zustand state management, FastAPI client functions, and backend endpoints. Triggered by requests to create, add, build, implement, or make nodes or workflow components.
---

# Node Creator

Guide for creating new workflow nodes in the MiCRA system.

## ⚠️ First: Review Existing Nodes

**Before implementing, read these reference implementations to understand exact patterns:**

- `frontend/src/components/workflow/nodes/ImageGenerationNode.tsx` - Image generation with aspect ratio and reference image
- `frontend/src/components/workflow/nodes/TextGenerationNode.tsx` - Text generation with preset management  
- `frontend/src/components/workflow/nodes/ImageMatchingNode.tsx` - Multi-image selection and matching

Follow the exact patterns from these files. They demonstrate:
- NodeConfig structure
- Zustand store integration
- State synchronization patterns
- API call handling
- Error management
- UI component structure

## Implementation Structure

A complete node often requires 4 files:

1. **Frontend Component** - `frontend/src/components/workflow/nodes/YourNodeNameNode.tsx`
2. **API Client** - `frontend/src/lib/fastapi/your-api-name.ts`
3. **Backend Endpoint (OPTIONAL)** - `backend/app/api/v1/your_endpoint.py`
4. **Route Registration (OPTIONAL)** - Add to `backend/app/api/routes.py`

The OPTIONAL files are only required if the functionality contained in the node requires backend processing. Some behaviour may only include manipulation of local data, in which case these are not necessary.

## Key Patterns

### NodeConfig
```typescript
const config: NodeConfig = {
  type: "your-node-type",  // kebab-case, unique
  label: "Your Node Name",
  description: "What this node does",
  inputs: [{ id: "input1", label: "Label", type: "string" }],
  outputs: [{ id: "output1", label: "Label", type: "json" }],
};
```

**Port Types:** `'string' | 'file' | 'image' | 'json' | 'image[]'`

### Component Structure
- Use `WorkflowNodeWrapper` with `nodeThemes.indigo|emerald|amber`
- Access store: `useWorkflowStore((state) => state.nodes[id])`
- Initialize state from `node.inputs`
- Sync to store via `useEffect`
- Status flow: `idle` → `running` → `completed`/`error`
- Store results in `node.outputs`

### API Client Pattern
```typescript
export interface YourRequest { field1: string }
export interface YourResponse { success: boolean; data?: any; error?: string }

export async function yourApiFunction(request: YourRequest): Promise<YourResponse> {
  return apiClient.request<YourResponse>('/v1/your-endpoint/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
}
```

### Backend Endpoint Pattern
```python
router = APIRouter(prefix="/your-endpoint", tags=["your-tag"])

class YourRequest(BaseModel):
    field1: str = Field(..., min_length=1)

class YourResponse(BaseModel):
    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None

@router.post("/action", response_model=YourResponse)
async def your_action(request: YourRequest):
    # Implementation
    return YourResponse(success=True, data=result)
```

### Route Registration
Add to `backend/app/api/routes.py`:
```python
from .v1 import your_endpoint
api_router.include_router(your_endpoint.router, prefix="/v1", tags=["your-tag"])
```

## Common Patterns

**Image Bucket Access:**
```typescript
const imageBucket = useWorkflowStore((state) => state.imageBucket);
const selectedImage = imageBucket.find(img => img.id === imageId);
```

**Multiple Image Selection:**
```typescript
const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
const selectedImages = imageBucket.filter(img => selectedImageIds.has(img.id));
```

**Preset Loading:**
```typescript
const [presets, setPresets] = useState<Preset[]>([]);
useEffect(() => { loadPresets(); }, []);
```

## Checklist

- [ ] Reviewed existing node implementations
- [ ] NodeConfig defined with correct types
- [ ] Component uses `WorkflowNodeWrapper` with theme
- [ ] State syncs to Zustand via `useEffect`
- [ ] `handleExecute` validates inputs
- [ ] Status updates: `running` → `completed`/`error`
- [ ] API client created with TypeScript interfaces
- [ ] Backend endpoint with Pydantic models
- [ ] Route registered in `routes.py`
- [ ] Error handling implemented
- [ ] Node type is unique (kebab-case)
