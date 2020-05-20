let {
  sendAlert,
  sendProposalAlert,
  log
} = require('./utils.js');

require('dotenv').config();

let web3WSProvider = process.env.WEB3_WS_PROVIDER;

// Setting up Web3 instance
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider(web3WSProvider));


async function startBot() {
  process.on('unhandledRejection', error => {
    log('unhandledRejection: ' + error.message);
    sendAlert(
      'dxDAO bot encountered an unexpected error',
      'unhandledRejection: ' +
        error.message +
        '\nPlease check the bot immediately'
    );
  });

  const ContributionReward = require('@daostack/migration/contracts/0.0.1-rc.19/ContributionReward.json').abi;
  let crAddress = "0x08cc7bba91b849156e9c44ded51896b38400f55b";
  let contributionReward = new web3.eth.Contract(ContributionReward, crAddress);
  log('Started listening to NewContributionProposal events of ContributionReward: ' + crAddress);
  let scanFromBlock = (await web3.eth.getBlockNumber()) - (4 * 60); // 1 hour

  contributionReward.events.NewContributionProposal({ fromBlock: scanFromBlock }, async (error, events) => {
      if (!error) {
        let proposalId = events.returnValues._proposalId;
        let rewards = events.returnValues._rewards;
        let avatar = events.returnValues._avatar.toLowerCase();
        let ethReward = web3.utils.fromWei(rewards[1] + '');
        let externalTokenReward = web3.utils.fromWei(rewards[2] + '');
        let reputationReward = web3.utils.fromWei(events.returnValues._reputationChange + '');
        if (avatar === "0x519b70055af55a007110b4ff99b0ea33071c720a" && (
            ethReward > 10 || reputationReward > 30000 || externalTokenReward > 20000
          )) {
            log(
              'Proposal: ' + proposalId + ' is requesting: ' + ethReward + ' ETH, ' + reputationReward + ' reputation, ' + externalTokenReward + ' tokens'
            );
          sendProposalAlert('Large Proposal', 'Proposal: ' + proposalId + ' is requesting: ' + ethReward, proposalId)
        }
      } else {
        log('Failed to start event listener');
      }
    })
    .on('error', console.error);
}

if (require.main === module) {
  startBot().catch(err => {
    console.log(err);
  });
} else {
  module.exports = {
    startBot
  };
}
