## Spotify New Releases Automation

Automates a Spotify “New Releases” playlist by tracking followed artists and automatically updating a playlist when new music is released.  
The backend runs on Azure Functions, using the Spotify Web API.

## Features
- Automatically fetches followed artists
- Detects latest releases (singles, EPs, albums)
- Adds new tracks to a target Spotify playlist
- Prevents duplicate tracks from being added
- Serverless backend using Azure Functions
- Optional GUI for triggering and managing updates

## Tech Stack
- Node.js
- Azure Functions
- Spotify Web API
- JavaScript

## Prerequisites
- Node.js 18+
- Spotify account
- Spotify Developer App (Client ID / Secret)
- Azure Functions Core Tools

## Environment Variables
Create a '.env' or 'local.settings.json' locally (do not commit):
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
SPOTIFY_REFRESH_TOKEN
SPOTIFY_PLAYLIST_ID



## Running Locally

Install dependencies:
npm install

Start Azure Functions:
func start



## How It Works
1. Authenticates with Spotify using OAuth
2. Retrieves followed artists
3. Fetches each artist’s most recent releases
4. Filters for new tracks within a defined time window
5. Deduplicates tracks already in the playlist
6. Adds new tracks to the target playlist

## Deployment
Designed to run as a serverless Azure Function.

High-level steps:
1. Create an Azure Function App
2. Configure environment variables in Azure
3. Deploy via Azure CLI or GitHub Actions

## Future Improvements
- Scheduled triggers (daily/weekly automation)
- Release date window configuration
- Multi-playlist support
- GitHub Actions CI/CD
- Improved logging and error handling

## License
MIT





