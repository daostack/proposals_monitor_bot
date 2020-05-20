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
let scanFromBlock;

const DX_AVATAR = "0x519b70055af55a007110b4ff99b0ea33071c720a";

async function genericSchemeMonitoring(genericSchemeAddress) {
  const GenericScheme = require('@daostack/migration/contracts/0.0.1-rc.36/GenericScheme.json').abi;
  let genericScheme = new web3.eth.Contract(GenericScheme, genericSchemeAddress);
  log('Started listening to NewCallProposal events of GenericScheme: ' + genericSchemeAddress);

  genericScheme.events.NewCallProposal({ fromBlock: scanFromBlock }, async (error, events) => {
    if (!error) {
      let proposalId = events.returnValues._proposalId;
      let value = web3.utils.fromWei(events.returnValues._value + '');
      let avatar = events.returnValues._avatar.toLowerCase();

      if (avatar === DX_AVATAR && value > 0) {
        let proposalData = 'Generic Scheme Proposal: ' + proposalId + ' is requesting to send : ' + value + ' ETH' 
        log(proposalData);
        sendProposalAlert('Large Proposal', proposalData, proposalId)
      }
    } else {
      log('Failed to start event listener');
    }
  })
}

async function uGenericSchemeMonitoring(uGenericSchemeAddress) {
  const GenericScheme = require('@daostack/migration/contracts/0.0.1-rc.19/GenericScheme.json').abi;
  let genericScheme = new web3.eth.Contract(GenericScheme, uGenericSchemeAddress);
  log('Started listening to NewCallProposal events of GenericScheme (dxDAO): ' + uGenericSchemeAddress);

  genericScheme.events.NewCallProposal({ fromBlock: scanFromBlock }, async (error, events) => {
    if (!error) {
      let proposalId = events.returnValues._proposalId;
      let value = web3.utils.fromWei(events.returnValues._value + '');
      let avatar = events.returnValues._avatar.toLowerCase();

      if (avatar === DX_AVATAR && value > 0) {
        let proposalData = 'Generic Scheme Proposal: ' + proposalId + ' is requesting to send : ' + value + ' ETH' 
        log(proposalData);
        sendProposalAlert('Large Proposal', proposalData, proposalId)
      }
    } else {
      log('Failed to start event listener');
    }
  })
}

async function schemeRegistrarMonitoring(schemeRegistrarAddress) {
  const SchemeRegistrar = require('@daostack/migration/contracts/0.0.1-rc.19/SchemeRegistrar.json').abi;
  let schemeRegistrar = new web3.eth.Contract(SchemeRegistrar, schemeRegistrarAddress);
  log('Started listening to NewSchemeProposal events of SchemeRegistrar: ' + schemeRegistrarAddress);

  let callback = async (error, events) => {
    if (!error) {
      let proposalId = events.returnValues._proposalId;
      let avatar = events.returnValues._avatar.toLowerCase();

      if (avatar === DX_AVATAR) {
        let proposalData = 'Scheme Registrar Proposal: ' + proposalId 
        log(proposalData);
        sendProposalAlert('Scheme Registrar Proposal', proposalData, proposalId)
      }
    } else {
      log('Failed to start event listener');
    }
  }
  schemeRegistrar.events.NewSchemeProposal({ fromBlock: scanFromBlock }, callback)
  schemeRegistrar.events.RemoveSchemeProposal({ fromBlock: scanFromBlock }, callback)
}

async function contributionRewardMonitoring(contributionRewardAddress) {
  const ContributionReward = require('@daostack/migration/contracts/0.0.1-rc.19/ContributionReward.json').abi;
  let contributionReward = new web3.eth.Contract(ContributionReward, contributionRewardAddress);
  log('Started listening to NewContributionProposal events of ContributionReward: ' + contributionRewardAddress);

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
          let proposalData = 'Contribution Reward Proposal: ' + proposalId + ' is requesting: ' + ethReward + ' ETH, ' + reputationReward + ' reputation, ' + externalTokenReward + ' tokens'
          log(proposalData);
          sendProposalAlert('Large Proposal', proposalData, proposalId)
      }
    } else {
      log('Failed to start event listener');
    }
  });
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

  // ContributionReward (ContributionReward v19)
  const ContributionReward = "0x08cc7bba91b849156e9c44ded51896b38400f55b";
  contributionRewardMonitoring(ContributionReward);

  // GenericScheme (GenericScheme v36)
  const GenericSchemeENSPublicProvider = "0x9a543aef934c21da5814785e38f9a7892d3cde6e";
  const GenericSchemeENSRegistry = "0x46df3ea38a680fbc84e744d92b0a8ec717b2ea7e";
  const GenericSchemeENSETHRegistry = "0x973ce4e81bdc3bd39f46038f3aaa928b04558b08";
  const GenericSchemeENSRegistryWithFallback = "0x9cea0dd05c4344a769b2f4c2f8890eda8a700d64";
  genericSchemeMonitoring(GenericSchemeENSPublicProvider);
  genericSchemeMonitoring(GenericSchemeENSRegistry);
  genericSchemeMonitoring(GenericSchemeENSETHRegistry);
  genericSchemeMonitoring(GenericSchemeENSRegistryWithFallback);

  // UGenericScheme (GenericScheme v19)
  const DXDAOGenericScheme = "0x199719EE4d5DCF174B80b80afa1FE4a8e5b0E3A0";
  uGenericSchemeMonitoring(DXDAOGenericScheme);

  // SchemeRegistrar (SchemeRegistrar v19)
  const SchemeRegistrar = "0xf050F3C6772Ff35eB174A6900833243fcCD0261F";
  schemeRegistrarMonitoring(SchemeRegistrar);
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
