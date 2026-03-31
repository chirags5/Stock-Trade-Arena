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
If script execution is disabled, you might need to run Set-ExecutionPolicy RemoteSigned -Scope CurrentUser in an administrator PowerShell session first.
Set-ExecutionPolicy -ExecutionPolicy Unrestricted -Scope CurrentUser
then run 
.\venv\Scripts\Activate.ps1

cd backend
pip install -r requirements.txt
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


Also below are the steps and a video on how you can create your own telegram bot
📬 Telegram Alert Setup
Step 1 — Create a Bot & Get Token
Open Telegram → search @BotFather

Send /start then /newbot

Enter a name e.g. My Scanner Bot

Enter a username ending in bot e.g. myscanneralert_bot

Copy the Bot Token → looks like 8603980520:AAEQTxxxxxxxxxxxxxxx

Step 2 — Get Your Chat ID
Open Telegram → search @userinfobot

Send /start

Copy the Id number it replies with e.g. 1249692664

Step 3 — Activate Your Bot ⚠️
Search your bot by username e.g. @myscanneralert_bot

Open it → click Start or send /start

This step is mandatory — without it the bot cannot send you messages

Step 4 — Enter in Settings
Open Scanner → Notification Settings

Paste Bot Token and Chat ID in the Telegram panel

Settings auto-save as you type

Click Send Test Message to verify ✅

Video link: https://drive.google.com/drive/folders/1bkk51IJ5g-SK7obTBM4M7hh5mzPOBSdL
