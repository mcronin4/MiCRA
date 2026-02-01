# Vercel Deployment Checklist

## What is Being Ignored in `.vercelignore`

### ✅ SAFE TO IGNORE (Won't Break Deployment)

#### 1. **Generated Output Files** (Lines 3-7)
- `backend/app/agents/image_extraction/outputs/` - Generated keyframe images (1516+ files, ~260MB)
- `backend/app/agents/image_extraction/downloads/` - Temporary downloaded videos
- **Why Safe**: These are created at runtime when processing videos. The code creates these directories automatically.

#### 2. **Model Files** (Lines 9-17)
- `backend/app/agents/image_extraction/resnet18_places365.pth.tar` - Pre-trained model (~50MB)
- **Why Safe**: The code auto-downloads this file on first use (see `analyze_frame.py` lines 35-52)
- **Download URL**: `http://places2.csail.mit.edu/models_places365/resnet18_places365.pth.tar`

#### 3. **Python Virtual Environments** (Lines 19-27)
- `backend/venv/`, `backend/.venv/` - Local Python environments
- `__pycache__/`, `*.pyc` - Python bytecode cache
- **Why Safe**: Vercel installs dependencies from `requirements.txt`/`pyproject.toml` during build

#### 4. **Node Modules & Build Caches** (Lines 29-43)
- `node_modules/` - NPM packages
- `.next/` - Next.js build cache
- `build/`, `dist/`, `out/` - Build artifacts
- **Why Safe**: Vercel runs `npm install` and `npm run build` during deployment

#### 5. **Development Files** (Lines 45-101)
- Test files (`*.test.js`, `*.spec.ts`, etc.)
- Log files (`*.log`)
- Environment files (`.env`, `.env*.local`) - Use Vercel environment variables instead
- IDE files (`.vscode/`, `.idea/`)
- OS files (`.DS_Store`, `Thumbs.db`)
- Git files (`.git/`, `.gitignore`)
- Media files (`*.mp4`, `*.mp3`, etc.)
- Archive files (`*.zip`, `*.tar`, etc.)

### ⚠️ CRITICAL FILES THAT ARE INCLUDED (Required for Deployment)

#### Backend Code (✅ Included)
- All Python source files (`backend/app/**/*.py`) - **56 Python files**
- `backend/requirements.txt` - Dependency list
- `backend/pyproject.toml` - Project configuration
- `backend/app/main.py` - FastAPI entry point
- All API routes (`backend/app/api/**/*.py`)
- All agent modules (`backend/app/agents/**/*.py`)

#### Frontend Code (✅ Included)
- All TypeScript/React files (`frontend/src/**/*.{ts,tsx}`)
- `frontend/package.json` - NPM dependencies
- `frontend/next.config.ts` - Next.js configuration

#### Small Required Files (✅ Included)
- `backend/app/agents/image_extraction/categories_places365.txt` (7.1KB) - Small categories file
  - **Note**: This can also be auto-downloaded, but it's small enough to include

## How to Verify Everything Works

### 1. **Backend API Endpoints**
All endpoints should work because:
- ✅ All Python source code is included
- ✅ Dependencies are installed from `requirements.txt`
- ✅ Model files auto-download on first use

**Test Endpoints:**
- `GET /api/` - Health check
- `POST /api/v1/image-extraction` - Will auto-download model on first use
- `POST /api/v1/transcription` - Should work immediately
- All other API endpoints

### 2. **Model Auto-Download**
The Places365 model will download automatically:
- **First request** to image extraction: ~30-60 second delay while downloading ~50MB model
- **Subsequent requests**: Uses cached model file
- **Download location**: `backend/app/agents/image_extraction/resnet18_places365.pth.tar`

### 3. **Output Directory Creation**
The code creates output directories automatically:
- `outputs/keyframes/` - Created when processing videos
- No manual setup required

### 4. **Frontend**
- ✅ All source code included
- ✅ Dependencies installed from `package.json`
- ✅ Build runs during deployment

## Potential Issues & Solutions

### Issue 1: First Image Extraction Request is Slow
**Cause**: Model downloading (~50MB)
**Solution**: Acceptable - only happens once per deployment. Consider pre-warming the endpoint.

### Issue 2: Model Download Fails
**Cause**: Network issue or MIT server down
**Solution**: The code will exit with error. Check logs and ensure internet connectivity.

### Issue 3: Output Directory Permissions
**Cause**: Vercel filesystem is read-only in some areas
**Solution**: The code uses `/tmp` or creates directories in allowed locations. Should work automatically.

## Deployment Size Estimate

**Before `.vercelignore`:**
- Backend code: ~5MB
- Outputs directory: ~260MB
- Model file: ~50MB
- Git history: ~170MB
- **Total: ~485MB** ❌ (Exceeds 300MB limit)

**After `.vercelignore`:**
- Backend code: ~5MB
- Frontend code: ~2MB
- Dependencies: Installed during build
- **Total: ~7MB** ✅ (Well under 300MB limit)

## Testing Checklist

After deployment, verify:

- [ ] Backend health check: `GET /api/` returns `{"message": "Hello, World!"}`
- [ ] Image extraction endpoint: `POST /api/v1/image-extraction` (first call will be slow)
- [ ] Transcription endpoint: `POST /api/v1/transcription`
- [ ] Frontend loads: Check Vercel deployment URL
- [ ] Check Vercel logs for any errors
- [ ] Verify model downloaded successfully (check logs)


