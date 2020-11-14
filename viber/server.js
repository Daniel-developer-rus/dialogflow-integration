const express = require("express");
const ViberBot = require("viber-bot").Bot;
const BotEvents = require("viber-bot").Events;
const TextMessage = require("viber-bot").Message.Text;
const PictureMessage = require("viber-bot").Message.Picture;
const protoToJson = require("../botlib/proto_to_json.js");
const filterResponses = require("../botlib/filter_responses.js");
const dialogflowSessionClient = require("../botlib/dialogflow_session_client.js");
const app = express();

const webhookUrl = "Place webhook url here";
const projectId = "hair-helper-pay-jkxy";
const botName = "Hairly";
const botAvatarLink =
  "https://share.cdn.viber.com/pg_download?id=0-04-01-6b257084144fc234d114a2a632295110440fededc72a27a8f4c91bf6acba8fa4&filetype=jpg&type=icon";
const viberToken = "4c4ae0b0b5400efd-b24307e5f19de358-37c567381c083a96";

const sessionClient = new dialogflowSessionClient(projectId);

const bot = new ViberBot({
  authToken: viberToken,
  name: botName,
  avatar: botAvatarLink,
  registerToEvents: [
    "subscribed",
    "unsubscribed",
    "conversation_started",
    "message",
  ],
});

app.use("/", bot.middleware());

const port = process.env.PORT;

const listener = app.listen(port, () => {
  console.log(
    "Your Viber integration server is listening on port " +
      listener.address().port
  );
  init();
});

bot.on(BotEvents.MESSAGE_RECEIVED, async (message, response) => {
  const userProfile = response.userProfile;
  const sessionId = botName;
  const answer = (
    await sessionClient.detectIntent(message.text, sessionId, {
      message,
      userProfile,
    })
  ).fulfillmentMessages;
  const reply = await convertToViberMessage(answer);
  if (reply) {
    bot.sendMessage(userProfile, reply);
  }
});

bot.on(BotEvents.CONVERSATION_STARTED, async (response) => {
  const result = await sessionClient.detectIntentWithEvent(
    "VIBER_WELCOME",
    projectId
  );
  const replies = await convertToViberMessage(result.fulfillmentMessages);
  bot.sendMessage(response.userProfile, replies);
});

process.on("SIGTERM", () => {
  listener.close(async () => {
    console.log("Closing server.");
    removeWebhook();
    process.exit(0);
  });
});

let init = () => {
  bot.setWebhook(webhookUrl);
};

let removeWebhook = () => {
  //Setting a webhook with empty string removes prior webhook
  bot.setWebhook("");
};

async function convertToViberMessage(responses) {
  const replies = [];
  if (Array.isArray(responses)) {
    const filteredResponses = await filterResponses.filterResponses(
      responses,
      "VIBER"
    );
    await filteredResponses.forEach(async (response) => {
      let reply = null;
      switch (response.message) {
        case "text":
          {
            if (response.text.text[0] !== "") {
              reply = new TextMessage(response.text.text[0]);
            }
          }
          break;

        case "image":
          {
            reply = new PictureMessage(response.image.imageUri);
          }
          break;

        case "card":
          {
            const buttons = response.card.buttons;
            let viberButtons = [];
            let keyboard = null;
            if (Array.isArray(buttons) && buttons.length > 0) {
              buttons.forEach((button) => {
                if (button.postback.startsWith("http")) {
                  viberButtons.push({
                    ActionType: "open-url",
                    Text: button.text,
                    ActionBody: button.postback,
                  });
                } else {
                  viberButtons.push({
                    ActionType: "reply",
                    ActionBody: button.postback,
                    Text: button.text,
                  });
                }
              });
              keyboard = {
                Type: "keyboard",
                DefaultHeight: true,
                Buttons: viberButtons,
              };
            }
            let msgText = "";
            if (response.card.title) {
              msgText = response.card.title;
            }
            if (response.card.subtitle) {
              msgText += "\n" + response.card.subtitle;
            }
            if (response.card.imageUri) {
              reply = new PictureMessage(
                response.card.imageUri,
                msgText,
                null,
                keyboard
              );
            } else if (msgText !== "") {
              reply = new TextMessage(msgText, keyboard);
            }
          }
          break;

        case "quickReplies":
          {
            const replies = response.quickReplies.quickReplies;
            const title = response.quickReplies.title
              ? response.quickReplies.title
              : "Choose an item";
            if (Array.isArray(replies) && replies.length > 0) {
              let keyboard = {
                Type: "keyboard",
                DefaultHeight: true,
                Buttons: [],
              };
              replies.forEach((reply) => {
                keyboard.Buttons.push({
                  ActionType: "reply",
                  ActionBody: reply,
                  Text: reply,
                  TextSize: "regular",
                });
              });
              reply = new TextMessage(title, keyboard);
            }
          }
          break;

        case "payload":
          {
            let payload = response.payload.fields.viber.structValue;
            payload = await protoToJson.structProtoToJson(payload);
            reply = bot._messageFactory.createMessageFromJson({
              message: payload,
            });
            if (payload.keyboard) {
              reply.keyboard = payload.keyboard;
            }
          }
          break;

        default:
          break;
      }
      replies.push(reply);
    });
  }
  return replies;
}

module.exports = {
  convertToViberMessage,
};
