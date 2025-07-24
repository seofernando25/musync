import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  MessageFlags,
} from "discord.js";
import type {
    Interaction,
    CacheType,
    GuildMember,
    VoiceBasedChannel,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import type { VoiceConnection, AudioPlayer } from "@discordjs/voice";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN) {
  throw new Error("Missing DISCORD_TOKEN in .env.local");
}
if (!CLIENT_ID) {
    throw new Error("Missing CLIENT_ID in .env.local");
}


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Plays a song from YouTube.")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("A search query or YouTube URL")
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName("skip").setDescription("Skips the current song."),
  new SlashCommandBuilder().setName("stop").setDescription("Stops the music and clears the queue."),
  new SlashCommandBuilder().setName("pause").setDescription("Pauses the music."),
  new SlashCommandBuilder().setName("resume").setDescription("Resumes the music."),
  new SlashCommandBuilder().setName("queue").setDescription("Shows the current song queue."),
  new SlashCommandBuilder().setName("connect").setDescription("Connects the bot to your voice channel."),
  new SlashCommandBuilder().setName("loop").setDescription("Toggles looping for the current song."),
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  try {
    console.log("Started refreshing application (/) commands.");
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands,
    });
    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
});

interface Song {
    title: string;
    url: string;
}

interface ServerQueue {
    voiceChannel: VoiceBasedChannel;
    connection: VoiceConnection;
    songs: Song[];
    player: AudioPlayer;
    playing: boolean;
    loop: boolean;
}

const queue = new Map<string, ServerQueue>();

async function handleInteraction(interaction: Interaction<CacheType>) {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    return interaction.reply({
      content: "You need to be in a voice channel to use music commands!",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const serverQueue = queue.get(interaction.guildId);

  switch (interaction.commandName) {
    case "connect":
        if (!serverQueue) {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guildId,
                adapterCreator: interaction.guild!.voiceAdapterCreator,
            });
            const newQueue: ServerQueue = {
                voiceChannel: voiceChannel,
                connection: connection,
                songs: [],
                player: createAudioPlayer({
                    behaviors: {
                        noSubscriber: NoSubscriberBehavior.Play,
                    },
                }),
                playing: false,
                loop: false,
            };
            queue.set(interaction.guildId, newQueue);
            newQueue.connection.subscribe(newQueue.player);
            await interaction.reply(`Connected to ${voiceChannel.name}!`);
        } else {
            await interaction.reply(`Already connected to a voice channel!`);
        }
        break;

    case "play":
      const query = interaction.options.getString("query", true);
      console.log(`[play] Received command with query: ${query}`);
      
      try {
        await interaction.deferReply();

        // Use yt-dlp to search and get info. The -j flag outputs JSON.
        const { stdout } = await execAsync(
          `yt-dlp --default-search "ytsearch1:" --dump-single-json "${query}"`
        );
        const songInfo = JSON.parse(stdout);

        const song: Song = {
          title: songInfo.title,
          url: songInfo.webpage_url,
        };
        
        if (!serverQueue) {
          const newQueue: ServerQueue = {
              voiceChannel: voiceChannel,
              connection: joinVoiceChannel({
                  channelId: voiceChannel.id,
                  guildId: interaction.guildId,
                  adapterCreator: interaction.guild!.voiceAdapterCreator,
              }),
              songs: [song],
              player: createAudioPlayer({
                  behaviors: {
                      noSubscriber: NoSubscriberBehavior.Play,
                  },
              }),
              playing: true,
              loop: false,
          };
          queue.set(interaction.guildId, newQueue);
          newQueue.connection.subscribe(newQueue.player);

          playSong(interaction.guildId, newQueue);
          await interaction.editReply(`Now playing: **${song.title}**`);
        } else {
            serverQueue.songs.push(song);
            if (!serverQueue.playing) {
                playSong(interaction.guildId, serverQueue);
            }
            await interaction.editReply(`Added to queue: **${song.title}**`);
        }
      } catch (error) {
          console.error(`[play] Error searching for song with query "${query}":`, error);
          await interaction.editReply({ content: "I couldn't find a video with that query or there was an error." });
      }
      break;
    
    case "skip":
        if (!serverQueue || !serverQueue.playing) {
            return interaction.reply({ content: "There is no song to skip.", flags: [MessageFlags.Ephemeral] });
        }
        serverQueue.player.stop();
        await interaction.reply("Skipped the current song.");
        break;

    case "stop":
        if (!serverQueue) {
            return interaction.reply({ content: "The bot is not playing anything.", flags: [MessageFlags.Ephemeral] });
        }
        serverQueue.songs = [];
        serverQueue.player.stop();
        serverQueue.connection.destroy();
        queue.delete(interaction.guildId);
        await interaction.reply("Stopped the music and cleared the queue.");
        break;

    case "pause":
        if (!serverQueue || !serverQueue.playing) {
            return interaction.reply({ content: "There is no song to pause.", flags: [MessageFlags.Ephemeral] });
        }
        serverQueue.player.pause();
        await interaction.reply("Paused the music.");
        break;
    
    case "resume":
        if (!serverQueue || !serverQueue.playing) {
            return interaction.reply({ content: "There is no song to resume.", flags: [MessageFlags.Ephemeral] });
        }
        serverQueue.player.unpause();
        await interaction.reply("Resumed the music.");
        break;

    case "queue":
        if (!serverQueue || serverQueue.songs.length === 0) {
            return interaction.reply({ content: "The queue is empty.", flags: [MessageFlags.Ephemeral] });
        }
        const songList = serverQueue.songs.map((s, index) => `${index + 1}. ${s.title}`).join("\n");
        await interaction.reply(`**Current Queue:**\n${songList}`);
        break;

    case "loop":
        if (!serverQueue) {
            return interaction.reply({ content: "There is nothing playing to loop.", flags: [MessageFlags.Ephemeral] });
        }
        serverQueue.loop = !serverQueue.loop;
        await interaction.reply(`Looping is now **${serverQueue.loop ? "enabled" : "disabled"}** for the current song.`);
        break;
  }
}

async function playSong(guildId: string, serverQueue: ServerQueue) {
    const song = serverQueue.songs[0];
    if (!song) {
        // If queue is empty, clean up
        if (serverQueue.connection) {
            serverQueue.connection.destroy();
        }
        queue.delete(guildId);
        return;
    }
    console.log(`[playSong] Attempting to play: ${song.title} (${song.url})`);

    try {
        // Use yt-dlp to get the best audio-only stream URL
        const { stdout } = await execAsync(
            `yt-dlp -f bestaudio -g "${song.url}"`
        );
        const streamUrl = stdout.trim();

        const resource = createAudioResource(streamUrl);
        serverQueue.player.play(resource);
        serverQueue.playing = true;

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            if (!serverQueue.loop) {
                serverQueue.songs.shift();
            }

            if (serverQueue.songs.length > 0) {
                playSong(guildId, serverQueue);
            } else {
                serverQueue.playing = false;
                // Disconnect after 1 minute of inactivity
                setTimeout(() => {
                    if (!serverQueue.playing && serverQueue.songs.length === 0) {
                        if (serverQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                            serverQueue.connection.destroy();
                        }
                        queue.delete(guildId);
                    }
                }, 60000); 
            }
        });

    } catch (error) {
        if (error instanceof Error) {
            console.error(`[playSong] Error creating stream for ${song.title}: ${error.message}`);
        } else {
            console.error(`[playSong] An unknown error occurred while creating stream for ${song.title}:`, error);
        }
        serverQueue.songs.shift();
        // Try to play the next song in the queue
        if(serverQueue.songs.length > 0) {
            playSong(guildId, serverQueue);
        } else {
            // If queue is empty, clean up
            serverQueue.playing = false;
        }
    }
}

client.on(Events.InteractionCreate, handleInteraction);

client.login(TOKEN);

console.log("Musync is starting...");