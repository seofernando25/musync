## Musync - Discord Music Bot

Musync is a lightweight, high-performance Discord music bot built with [Bun](https://bun.sh) and [discord.js](https://discord.js.org). It uses `yt-dlp` to stream audio from YouTube directly into your server's voice channels.

### Features

- Play music from YouTube via search or URL
- Manage a song queue with commands to skip, pause, resume, and stop
- Toggle looping for the current song
- Display the current song queue
- Simple, fast, and easy to set up

---

## Getting Started

### 1. Prerequisites

Before you begin, ensure you have the following installed on your system:

- [Bun](https://bun.sh/docs/installation)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation)
    - If you have python its very easy to install it with `pip install yt-dlp`

### 2. Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd musync
    ```

2.  **Install dependencies using Bun:**
    ```bash
    bun install
    ```

3.  **Set up your environment variables:**

    Create a file named `.env` in the root of the project and add your Discord bot token and client ID.

    ```env
    DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
    CLIENT_ID=YOUR_DISCORD_APPLICATION_CLIENT_ID
    ```

### 3. Running the Bot

Start the bot using the following command:

```bash
bun dev
```

Once running, the bot will log in and be ready to accept commands in your Discord server.