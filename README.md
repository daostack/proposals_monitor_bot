# Proposal Monitor Bot

This bot monitors specified schemes of DAOs for new proposals and proposals which were moved to a more progressed state (pre-boosting/ boosting) based on specified criteria. Telegram notifications will be sent by the bot for detected events, with each DAO having its own telegram chat for notifications. The goal is to ensure no "high risk" proposals go unnoticed.

## Running the bot

To run the bot, clone the code and enter the directory, then install the dependencies.
You will also need to install `forever`, a tool for ensuring the bot will run continuously in the background.

```
git clone https://github.com/daostack/proposals_monitor_bot.git
cd proposals_monitor_bot
npm install
npm install --global forever
```

Next, you will need to create a `.env` file with the following parameters:
```
WEB3_WS_PROVIDER = <WEB3 WEB SOCKET PROVIDER>
TG_BOT=<TELEGRAM BOT API KEY>
TG_CHAT_ID=<TELEGRAM CHAT ID> # Used only for emergency messages where the bot encounters an unexpected error

```

To start the bot, run:
```
npm run start
```

To see the logs output, run:
```
npm run logs
```

To stop the bot, run:
```
npm run stop
```

## Adding a DAO monitoring configuration

To add a new DAO for monitoring, a new JSON file should be added under the `daos` directory of the bot.
The file structure should be as follows:

```
{
  "Avatar": "<DAO AVATAR CONTRACT ADDRESS>",
  "Schemes": {
    "<SCHEME NAME>": {
        "contract": "<SCHEME CONTRACT NAME>",
        "address": "<THE SCHEME ADDRESS>",
        "arcVersion": "<ARC VERSION THE DEPLOYED SCHEME IS FROM>"
    }
    "<SCHEME NAME>": {
        "contract": "<SCHEME CONTRACT NAME>",
        "address": "<THE SCHEME ADDRESS>",
        "arcVersion": "<ARC VERSION THE DEPLOYED SCHEME IS FROM>"
    }
    "<SCHEME NAME>": {
        "contract": "<SCHEME CONTRACT NAME>",
        "address": "<THE SCHEME ADDRESS>",
        "arcVersion": "<ARC VERSION THE DEPLOYED SCHEME IS FROM>"
    }
  },
  "TG_CHAT_ID": "<TELEGRAM CHAT ROOM ID>"
}
```

Supported scheme contracts: `ContributionReward`, `SchemeRegistrar`, `GenericScheme`, `UGenericScheme`, `GenericSchemeMultiCall`.

After adding the DAO configuration file, just restart the bot for the changes to take place.
