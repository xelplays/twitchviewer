@echo off
echo 🚀 Starting Twitch Activity Bot...
echo.

REM Check if .env exists
if not exist .env (
    echo ❌ .env file not found!
    echo Please copy env.example to .env and configure your settings.
    echo.
    pause
    exit /b 1
)

REM Check if database exists
if not exist activity.db (
    echo 📊 Initializing database...
    npm run init-db
    echo.
)

REM Start the bot
echo 🤖 Starting bot...
npm start

pause
