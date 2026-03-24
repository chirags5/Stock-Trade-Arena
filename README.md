# Stock Trade Arena

Single setup guide for running the full app.

## 1. Clone the repo

```powershell
git clone https://github.com/chirags5/Stock-Trade-Arena.git
cd Stock-Trade-Arena
```

## 2. Backend setup and run

From project root:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
cd backend
pip install -r requirements.txt
```

Create .env file and add:

```env
GROQ_API_KEY=your_groq_api_key
```

Run backend:

```powershell
python app.py
```

## 3. Frontend setup and run

Open another terminal from project root:

```powershell
cd frontend
npm install
npm start
```


You do not need to run `database.py` separately.

Running `python app.py` is enough because backend startup calls `init_db()` automatically and creates the SQLite database/tables (`backend/arena.db`) if they do not exist.
