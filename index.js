let {
  sendAlert,
  sendProposalAlert,
  log
} = require('./utils.js');

require('dotenv').config();

const fs = require('fs')
const path = require('path')

let web3WSProvider = process.env.WEB3_WS_PROVIDER;

// Setting up Web3 instance
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider(web3WSProvider));
let scanFromBlock;

function isAvatarMatch(a1, a2) {
  return a1.toLowerCase() === a2.toLowerCase();
}

async function genericSchemeMonitoring(dao, avatarAddress, schemeName, address, arcVersion) {
  const GenericScheme = require('@daostack/migration/contracts/' + arcVersion + '/GenericScheme.json').abi;
  let genericScheme = new web3.eth.Contract(GenericScheme, address);
  log('Started listening to NewCallProposal events of ' + schemeName + ' (GenericScheme): ' + address);

  genericScheme.events.NewCallProposal({ fromBlock: scanFromBlock }, async (error, events) => {
    if (!error) {
      let proposalId = events.returnValues._proposalId;
      let value = web3.utils.fromWei(events.returnValues._value + '');
      let avatar = events.returnValues._avatar.toLowerCase();

      if (isAvatarMatch(avatar, avatarAddress) && value > 0) {
        let proposalData = 'DAO: ' + dao + ' | Generic Scheme Proposal: ' + proposalId + ' is requesting to send : ' + value + ' ETH' 
        log(proposalData);
        sendProposalAlert('Large Proposal', proposalData, avatar, proposalId)
      }
    } else {
      log('Failed to start event listener');
    }
  })
}

async function uGenericSchemeMonitoring(dao, avatarAddress, schemeName, address, arcVersion) {
  const GenericScheme = require('@daostack/migration/contracts/' + arcVersion + '/UGenericScheme.json').abi;
  let genericScheme = new web3.eth.Contract(GenericScheme, address);
  log('Started listening to NewCallProposal events of ' + schemeName + ' (UGenericScheme): ' + address);

  genericScheme.events.NewCallProposal({ fromBlock: scanFromBlock }, async (error, events) => {
    if (!error) {
      let proposalId = events.returnValues._proposalId;
      let value = web3.utils.fromWei(events.returnValues._value + '');
      let avatar = events.returnValues._avatar.toLowerCase();

      if (isAvatarMatch(avatar, avatarAddress) && value > 0) {
        let proposalData = 'DAO: ' + dao + ' | Generic Scheme Proposal: ' + proposalId + ' is requesting to send : ' + value + ' ETH' 
        log(proposalData);
        sendProposalAlert('Large Proposal', proposalData, avatar, proposalId)
      }
    } else {
      log('Failed to start event listener');
    }
  })
}

async function schemeRegistrarMonitoring(dao, avatarAddress, schemeName, address, arcVersion) {
  const SchemeRegistrar = require('@daostack/migration/contracts/' + arcVersion + '/SchemeRegistrar.json').abi;
  let schemeRegistrar = new web3.eth.Contract(SchemeRegistrar, address);
  log('Started listening to NewSchemeProposal and RemoveSchemeProposal events of ' + schemeName + ' (SchemeRegistrar): ' + address);

  let callback = async (error, events) => {
    if (!error) {
      let proposalId = events.returnValues._proposalId;
      let avatar = events.returnValues._avatar.toLowerCase();

      if (isAvatarMatch(avatar, avatarAddress)) {
        let proposalData = 'DAO: ' + dao + ' | Scheme Registrar Proposal: ' + proposalId 
        log(proposalData);
        sendProposalAlert('Scheme Registrar Proposal', proposalData, avatar, proposalId)
      }
    } else {
      log('Failed to start event listener');
    }
  }
  schemeRegistrar.events.NewSchemeProposal({ fromBlock: scanFromBlock }, callback)
  schemeRegistrar.events.RemoveSchemeProposal({ fromBlock: scanFromBlock }, callback)
}

async function contributionRewardMonitoring(dao, avatarAddress, schemeName, address, arcVersion) {
  const ContributionReward = require('@daostack/migration/contracts/' + arcVersion + '/ContributionReward.json').abi;
  let contributionReward = new web3.eth.Contract(ContributionReward, address);
  log('Started listening to NewContributionProposal events of ' + schemeName + ' (ContributionReward): ' + address);

  contributionReward.events.NewContributionProposal({ fromBlock: scanFromBlock }, async (error, events) => {
    if (!error) {
      let proposalId = events.returnValues._proposalId;
      let rewards = events.returnValues._rewards;
      let avatar = events.returnValues._avatar.toLowerCase();
      let ethReward = web3.utils.fromWei(rewards[1] + '');
      let externalTokenReward = web3.utils.fromWei(rewards[2] + '');
      let reputationReward = web3.utils.fromWei(events.returnValues._reputationChange + '');
      if (isAvatarMatch(avatar, avatarAddress) && (
          ethReward > 10 || reputationReward > 30000 || externalTokenReward > 20000
        )) {
          let proposalData = 'DAO: ' + dao + ' | Contribution Reward Proposal: ' + proposalId + ' is requesting: ' + ethReward + ' ETH, ' + reputationReward + ' reputation, ' + externalTokenReward + ' tokens'
          log(proposalData);
          sendProposalAlert('Large Proposal', proposalData, avatar, proposalId)
      }
    } else {
      log('Failed to start event listener');
    }
  });
}

async function monitorContract(dao, avatarAddress, schemeName, contract, address, arcVersion){
  switch(contract) {
    case 'ContributionReward':
      contributionRewardMonitoring(dao, avatarAddress, schemeName, address, arcVersion)
      break;
    case 'SchemeRegistrar':
      schemeRegistrarMonitoring(dao, avatarAddress, schemeName, address, arcVersion)
      break;
    case 'GenericScheme':
      genericSchemeMonitoring(dao, avatarAddress, schemeName, address, arcVersion)
      break;
    case 'UGenericScheme':
      uGenericSchemeMonitoring(dao, avatarAddress, schemeName, address, arcVersion)
      break;
  }
}

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

  scanFromBlock = (await web3.eth.getBlockNumber()) - (4 * 60); // 1 hour

  const daos = fs.readdirSync('./daos');
  for (let dao of daos) {
    log('Started monitoring DAO: ' + dao.split('.json')[0])
    const { Avatar, Schemes } = JSON.parse(fs.readFileSync(path.join('./daos', dao), 'utf-8'));
    for (let schemeName in Schemes) {
      let { contract, address, arcVersion } = Schemes[schemeName];
      await monitorContract(dao, Avatar, schemeName, contract, address, arcVersion);
    }
  }
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
