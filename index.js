// index.js
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

import {
  loadStoryConfig,
  startStory,
  applyChoice,
  loadStoryByCode,
  saveProgress,
} from "./storyEngine.js";

import {
  createStoryFolder,
  addScene,
  editSceneText,
  addChoice,
  publishStory,
  addGlobalItem,
  listGlobalItems,
} from "./storyEditor.js";

import fs from "fs";

const config = {
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
};



const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const sessions = {}; // userId -> { storyId, config, state }

// --------- définition des commandes ---------
const commands = [
      new SlashCommandBuilder()
    .setName("menu")
    .setDescription("Ouvre le menu du jeu"
    ),

  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Jouer une histoire publique")
    .addStringOption((o) =>
      o
        .setName("story")
        .setDescription("ID de l'histoire (dossier)")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("play-code")
    .setDescription("Jouer une histoire privée avec un code")
    .addStringOption((o) =>
      o
        .setName("code")
        .setDescription("Code de partage")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("story-create")
    .setDescription("Créer une nouvelle histoire (mode privé)")
    .addStringOption((o) =>
      o.setName("id").setDescription("ID de l'histoire").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("title").setDescription("Titre").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("story-addscene")
    .setDescription("Ajouter une scène")
    .addStringOption((o) =>
      o.setName("id").setDescription("ID de l'histoire").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("scene").setDescription("ID de la scène").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("story-settext")
    .setDescription("Changer le texte d'une scène")
    .addStringOption((o) =>
      o.setName("id").setDescription("ID de l'histoire").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("scene").setDescription("ID de la scène").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("text").setDescription("Texte").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("story-addchoice")
    .setDescription("Ajouter un choix à une scène")
    .addStringOption((o) =>
      o.setName("id").setDescription("ID de l'histoire").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("scene").setDescription("ID de la scène").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("text").setDescription("Texte du choix").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("next")
        .setDescription("ID de la scène suivante")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("story-publish")
    .setDescription("Publier une histoire (public / privé avec code)")
    .addStringOption((o) =>
      o.setName("id").setDescription("ID de l'histoire").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("item-add")
    .setDescription("Ajouter un objet global")
    .addStringOption((o) =>
      o.setName("name").setDescription("Nom de l'objet").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("item-list")
    .setDescription("Lister les objets globaux"),
].map((c) => c.toJSON());

// --------- enregistrement des commandes ---------
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands }
  );
  console.log("✔ Commandes enregistrées.");
}

// --------- helpers d’affichage ---------
function buildChoiceButtons(choices) {
  if (!choices || !choices.length) return [];
  const row = new ActionRowBuilder();
  choices.forEach((c, i) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`choice_${i}`)
        .setLabel(c.text)
        .setStyle(ButtonStyle.Primary)
    );
  });
  return [row];
}

async function sendScene(interaction, text, choices, edit = false) {
  const components = buildChoiceButtons(choices);
  if (edit) {
    await interaction.update({ content: text, components });
  } else {
    await interaction.reply({ content: text, components });
  }
}

// --------- gestion des interactions ---------
client.on("interactionCreate", async (interaction) => {
  // slash commands
  if (interaction.isChatInputCommand()) {
    const name = interaction.commandName;

    try {
              // /menu
      if (name === "menu") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ui_play")
            .setLabel("🎮 Jouer")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("ui_create")
            .setLabel("🛠️ Créer une histoire")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("ui_items")
            .setLabel("📦 Objets")
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: "**Menu principal du jeu :**\nChoisis une action ci-dessous 👇",
          components: [row],
          ephemeral: true
        });
      }

      // /play
      if (name === "play") {
        const storyId = interaction.options.getString("story");
        const cfg = loadStoryConfig(storyId, "public");
        if (!cfg) {
          return interaction.reply({
            content: "❌ Histoire introuvable en public.",
            ephemeral: true,
          });
        }

        const result = startStory(cfg, interaction.user.id);
        sessions[interaction.user.id] = {
          storyId,
          config: cfg,
          state: result.state,
        };

        await sendScene(interaction, result.text, result.choices);
        return;
      }

      // /play-code
      if (name === "play-code") {
        const code = interaction.options.getString("code");
        const loaded = loadStoryByCode(code);
        if (!loaded || !loaded.config) {
          return interaction.reply({
            content: "❌ Code invalide.",
            ephemeral: true,
          });
        }
        const { config: cfg, storyId } = loaded;
        const result = startStory(cfg, interaction.user.id);
        sessions[interaction.user.id] = {
          storyId,
          config: cfg,
          state: result.state,
        };

        await sendScene(interaction, result.text, result.choices);
        return;
      }

      // /story-create
      if (name === "story-create") {
        const id = interaction.options.getString("id");
        const title = interaction.options.getString("title");
        createStoryFolder(id, title);
        return interaction.reply(
          `📘 Histoire \`${id}\` créée en privé.\nUtilise \`/story-addscene\`, \`/story-settext\`, \`/story-addchoice\`, puis \`/story-publish\`.`
        );
      }

      // /story-addscene
      if (name === "story-addscene") {
        const id = interaction.options.getString("id");
        const scene = interaction.options.getString("scene");
        addScene(id, scene);
        return interaction.reply(
          `➕ Scène \`${scene}\` ajoutée à l'histoire \`${id}\`.`
        );
      }

      // /story-settext
      if (name === "story-settext") {
        const id = interaction.options.getString("id");
        const scene = interaction.options.getString("scene");
        const text = interaction.options.getString("text");
        editSceneText(id, scene, text);
        return interaction.reply(
          `✏ Texte de la scène \`${scene}\` mis à jour dans \`${id}\`.`
        );
      }

      // /story-addchoice
      if (name === "story-addchoice") {
        const id = interaction.options.getString("id");
        const scene = interaction.options.getString("scene");
        const text = interaction.options.getString("text");
        const next = interaction.options.getString("next");
        addChoice(id, scene, text, next);
        return interaction.reply(
          `➡ Choix "${text}" ajouté à \`${scene}\` (→ \`${next}\`).`
        );
      }

      // /story-publish
      if (name === "story-publish") {
        const id = interaction.options.getString("id");
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`pub_public_${id}`)
            .setLabel("Public")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`pub_private_${id}`)
            .setLabel("Privé (code)")
            .setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({
          content: "Tu veux publier comment ?",
          components: [row],
          ephemeral: true,
        });
      }

      // /item-add
      if (name === "item-add") {
        const nm = interaction.options.getString("name");
        const all = addGlobalItem(nm);
        return interaction.reply(
          `🧱 Objet **${nm}** ajouté. Total : ${all.length} objets.`
        );
      }

      // /item-list
      if (name === "item-list") {
        const all = listGlobalItems();
        if (!all.length) return interaction.reply("Aucun objet global.");
        return interaction.reply("Objets globaux : " + all.join(", "));
      }
    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: "❌ Erreur : " + err.message,
        ephemeral: true,
      });
    }
  }

  // boutons
  if (interaction.isButton()) {
    const id = interaction.customId;
    
        // boutons de l'interface /menu
    if (id === "ui_play") {
      return interaction.reply({
        content: "Pour jouer, utilise par exemple : `/play story:TON_ID_D_HISTOIRE`",
        ephemeral: true
      });
    }

    if (id === "ui_create") {
      return interaction.reply({
        content: "Pour créer une histoire : `/story-create id:monhistoire title:\"Mon histoire\"`",
        ephemeral: true
      });
    }

    if (id === "ui_items") {
      const items = listGlobalItems();
      return interaction.reply({
        content: items.length
          ? "📦 Objets globaux : " + items.join(", ")
          : "📦 Aucun objet global pour l’instant.",
        ephemeral: true
      });
    }


    // publication
    if (id.startsWith("pub_")) {
      const [, type, storyId] = id.split("_");
      const isPublic = type === "public";
      try {
        const { code } = publishStory(storyId, isPublic);
        if (isPublic) {
          return interaction.update({
            content: `✅ Histoire \`${storyId}\` publiée en **PUBLIC**.`,
            components: [],
          });
        } else {
          return interaction.update({
            content:
              `🔐 Histoire \`${storyId}\` publiée en **PRIVÉE**.\n` +
              `Code de partage : \`${code}\``,
            components: [],
          });
        }
      } catch (err) {
        return interaction.update({
          content: "❌ Erreur : " + err.message,
          components: [],
        });
      }
    }

    // choix de jeu
    if (id.startsWith("choice_")) {
      const idx = parseInt(id.split("_")[1], 10);
      const session = sessions[interaction.user.id];
      if (!session) {
        return interaction.reply({
          content: "Aucune partie en cours.",
          ephemeral: true,
        });
      }

      try {
        const result = applyChoice(session.config, session.state, idx);
        sessions[interaction.user.id].state = result.state;
        saveProgress(interaction.user.id, session.storyId, {
          state: result.state,
        });

        await sendScene(
          interaction,
          result.text,
          result.choices,
          true // on édite le message
        );
      } catch (err) {
        console.error(err);
        return interaction.reply({
          content: "❌ Erreur : " + err.message,
          ephemeral: true,
        });
      }
    }
  }
});

// --------- démarrage ---------
client.once("ready", () => {
  console.log(`🤖 Connecté en tant que ${client.user.tag}`);
});

(async () => {
  try {
    await registerCommands();
    await client.login(config.token);
  } catch (err) {
    console.error("Erreur au démarrage :", err);
  }
})();