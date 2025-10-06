# MiCRA
With Project X Ltd. (a Toronto-based AI / data consulting firm), we’re building a multi-modal content-repurposing agent that ingests long-form company content (call transcripts, papers, videos) and transforms the message into various outputs potentially including company blogs, marketing content (LinkedIn, X, …), and more.

# MiCRA How-To Guide
NOTE: If you haven’t done the “first-time setup” step, read and complete those first!

## 1) Running the backend locally

1. Ensure you’ve activated your venv
2. If you’ve pulled new changes recently, you may have to run: `pip install -r requirements.txt`
3. From the `/backend/app` directory, run: `fastapi dev main.py`

## 2) Running the backend locally

1. If you’ve pulled new changes recently, you may have to rerun `npm install`
2. From the `/frontend` directory, run: `npm run dev`

## 3) First-Time Setup

Your ‘command-line’ is accessible from any of these, depending on your OS and preference: terminal, git bash, powershell, CMD, et.c

1. Verify prerequisites
  - Run `python --version` or `python3 --version`. If you do not see a version, install python from python.org
  - Run `node -v` and `npm -v`, if you don’t see a version, install node from https://nodejs.org/en/download/ 
2. Clone the repo
- Run `git clone https://github.com/mcronin4/MiCRA.git` from the command line. 
- Then you can open this directory in your IDE
3. From the command-line, use the `cd` command (change directory) to navigate into the project root (e.g. `cd MiCRA`, but you have to navigate to where this directory is located first)
4. Setup backend environment
- Run `cd backend`
- Create and activate your virtual environment with
- macOS/Linux: _create_: `python -m venv .venv`, _activate_: `source .venv/bin/activate`
- Windows: _create_: `python -m venv .venv`, _activate_: `.venv\Scripts\Activate.ps1`
- Install existing dependencies with `pip install -r requirements.txt` (may have to use `pip3` if that doesn’t work)
4. Set up an backend environment variables file
- Create a file in `/backend` called `.env`
- In this file, add the line `GEMINI_API_KEY=your_api_key`
- Generate an API key at https://aistudio.google.com/api-keys if you don’t have one
5. Set up frontend dependencies
- Change to the `/frontend` directory
- Run `npm install` to install all the necessary dependencies
