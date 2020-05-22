let {
  sendAlert,
  sendAlertToChat,
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

let TG_CHATS = {};

function isAvatarMatch(a1, a2) {
  return a1.toLowerCase() === a2.toLowerCase();
}

async function listenProposalsStateChanges(genesisProtocol, scanFromBlock) {
  // Start listening to events
  genesisProtocol.events.StateChange({ fromBlock: scanFromBlock }, async (error, events) => {
      if (!error) {
        // Get the proposal and Genesis Protocol data
        let proposalId = events.returnValues._proposalId;
        let proposal = await genesisProtocol.methods.proposals(proposalId).call();

        if (proposal === null) {
          log(
            proposalId +
              ' on voting machine ' +
              genesisProtocol.address +
              'returned as null'
          );
          return;
        }

        if (proposal.state === 4 || proposal.state === 5) {
          let org = await genesisProtocol.methods.organizations(proposal.organizationId).call();
          const daos = fs.readdirSync('./daos');
          for (let dao of daos) {
            const { Avatar, Schemes } = JSON.parse(fs.readFileSync(path.join('./daos', dao), 'utf-8'));
            if (isAvatarMatch(org, Avatar)) {
              for (let schemeName in Schemes) {
                let scheme = Schemes[schemeName];
                if (scheme.address.toLowerCase() === proposal.callbacks.toLowerCase()) {
                  let state;
                  switch (proposal.state) {
                    case 4:
                      state = "PreBoosted"
                      break;
                    case 5:
                      state = "Boosted"
                      break;
                  }
                  switch(scheme.contract) {
                    case 'ContributionReward':
                      checkContributionRewardProposal(proposalId, scheme.address, Avatar, scheme.arcVersion, state);
                      break;
                    case 'SchemeRegistrar':
                    case 'GenericScheme':
                    case 'UGenericScheme':
                      var proposalData = 'DAO: ' + dao + ' | ' + schemeName +' Proposal: ' + proposalId + ' | state: ' + state;
                      log(proposalData);
                      sendProposalAlert(schemeName + ' Proposal', proposalData, TG_CHATS[Avatar], Avatar, proposalId, state)
                      break;
                  }
                }
              } 
            }
          }
        }

      } else {
        log('Failed to start event listener');
      }
    });
}


async function checkContributionRewardProposal(proposalId, crAddress, avatarAddress, arcVersion, state) {
  const ContributionReward = require('@daostack/migration/contracts/' + arcVersion + '/ContributionReward.json').abi;
  let contributionReward = new web3.eth.Contract(ContributionReward, crAddress);
  let proposal = await contributionReward.methods.organizationsProposals(avatarAddress, proposalId).call();
  let ethReward = web3.utils.fromWei(proposal.ethReward + '');
  let externalTokenReward = web3.utils.fromWei(proposal.externalTokenReward + '');
  let reputationReward = web3.utils.fromWei(proposal.reputationChange + '');
  const Avatar = require('@daostack/migration/contracts/' + arcVersion + '/Avatar.json').abi;
  let avatarContract = new web3.eth.Contract(Avatar, avatarAddress);
  const Reputation = require('@daostack/migration/contracts/' + arcVersion + '/Reputation.json').abi;
  let reputation = await avatarContract.methods.nativeReputation().call();
  let reputationContract = new web3.eth.Contract(Reputation, reputation);
  let totalReputation = web3.utils.fromWei((await reputationContract.methods.totalSupply().call()) + '');
  let isSuspiciousRep = reputationReward > (totalReputation / 100 * 5) || reputationReward < (totalReputation / 100 * -5)
  if ((ethReward > 10 || isSuspiciousRep) || externalTokenReward > 20000) {
      let proposalData = 'DAO: ' + avatarAddress + ' | Contribution Reward Proposal: ' + proposalId + ' is requesting: ' + ethReward + ' ETH, ' + reputationReward + ' reputation, ' + externalTokenReward + ' tokens' + ' | state: ' + state;
      log(proposalData);
      sendProposalAlert('Large Proposal', proposalData, TG_CHATS[avatarAddress], avatarAddress, proposalId, state)
  }
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
        let proposalData = 'DAO: ' + dao + ' | Generic Scheme Proposal: ' + proposalId + ' is requesting to send : ' + value + ' ETH' + ' | state: Queued'
        log(proposalData);
        sendProposalAlert('Large Proposal', proposalData, TG_CHATS[avatarAddress], avatarAddress, proposalId, 'Queued')
      }
    } else {
      log('Failed to start event listener');
    }
  });
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
        let proposalData = 'DAO: ' + dao + ' | Generic Scheme Proposal: ' + proposalId + ' is requesting to send : ' + value + ' ETH' + ' | state: Queued'
        log(proposalData);
        sendProposalAlert('Large Proposal', proposalData, TG_CHATS[avatarAddress], avatarAddress, proposalId, 'Queued')
      }
    } else {
      log('Failed to start event listener');
    }
  });
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
        let proposalData = 'DAO: ' + dao + ' | Scheme Registrar Proposal: ' + proposalId  + ' | state: Queued'
        log(proposalData);
        sendProposalAlert('Scheme Registrar Proposal', proposalData, TG_CHATS[avatarAddress], avatarAddress, proposalId, 'Queued')
      }
    } else {
      log('Failed to start event listener');
    }
  }
  schemeRegistrar.events.NewSchemeProposal({ fromBlock: scanFromBlock }, callback);
  schemeRegistrar.events.RemoveSchemeProposal({ fromBlock: scanFromBlock }, callback);
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
      const Avatar = require('@daostack/migration/contracts/' + arcVersion + '/Avatar.json').abi;
      let avatarContract = new web3.eth.Contract(Avatar, avatarAddress);
      const Reputation = require('@daostack/migration/contracts/' + arcVersion + '/Reputation.json').abi;
      let reputation = await avatarContract.methods.nativeReputation().call();
      let reputationContract = new web3.eth.Contract(Reputation, reputation);
      let totalReputation = web3.utils.fromWei((await reputationContract.methods.totalSupply().call()) + '');
      let isSuspiciousRep = reputationReward > (totalReputation / 100 * 5)

      if (isAvatarMatch(avatar, avatarAddress) && (
          ethReward > 10 || isSuspiciousRep || externalTokenReward > 20000
        )) {
          let proposalData = 'DAO: ' + dao + ' | Contribution Reward Proposal: ' + proposalId + ' is requesting: ' + ethReward + ' ETH, ' + reputationReward + ' reputation, ' + externalTokenReward + ' tokens' + ' | state: Queued'
          log(proposalData);
          sendProposalAlert('Large Proposal', proposalData, TG_CHATS[avatarAddress], avatarAddress, proposalId, 'Queued')
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
    const { Avatar, Schemes, TG_CHAT_ID } = JSON.parse(fs.readFileSync(path.join('./daos', dao), 'utf-8'));
    TG_CHATS[Avatar] = TG_CHAT_ID;
    for (let schemeName in Schemes) {
      let { contract, address, arcVersion } = Schemes[schemeName];
      await monitorContract(dao, Avatar, schemeName, contract, address, arcVersion);
    }

    setInterval(function() { 
      sendAlertToChat('Monitoring bot is running', 'This is a periodical automatic message to ensure the bot is live', TG_CHAT_ID);
    }, 1000 * 60 * 60 * 6);
  }
  const DAOstackMigration = require('@daostack/migration');
  let migration = DAOstackMigration.migration('mainnet');
  let activeVMs = [];
  for (let version in migration.base) {
    const GenesisProtocol = require('@daostack/migration/contracts/' +
      version +
      '/GenesisProtocol.json').abi;
    let gpAddress = migration.base[version].GenesisProtocol;
    if (activeVMs.indexOf(gpAddress) !== -1) {
      continue;
    }
    activeVMs.push(gpAddress);
    let genesisProtocol = new web3.eth.Contract(GenesisProtocol, gpAddress);
    // Subscrice to StateChange events of the Genesis Protocol
    log('Started listening to StateChange events of Genesis Protocol: ' + gpAddress);

    await listenProposalsStateChanges(genesisProtocol, scanFromBlock);
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
