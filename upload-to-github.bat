@echo off
echo 🚀 Uploading Twitch Activity Bot to GitHub...
echo.

echo 📦 Initializing Git repository...
git init

echo 📝 Adding all files...
git add .

echo 💾 Creating initial commit...
git commit -m "Initial commit: Twitch Activity Leaderboard Bot

- Complete bot implementation with tmi.js
- Viewtime tracking and chat points system
- Clip submission and review system
- OBS overlay with live leaderboard
- Admin dashboard for clip management
- REST API with authentication
- Monthly winner cron job
- Anti-spam and security measures
- Optional Twitch API integration
- Comprehensive documentation"

echo 🌐 Adding remote origin...
echo Please replace YOUR_USERNAME and YOUR_REPO_NAME with your actual GitHub details:
echo git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

echo 📤 Pushing to GitHub...
echo git push -u origin main

echo.
echo ✅ Ready to upload! Run the git commands above with your GitHub details.
echo.
pause
