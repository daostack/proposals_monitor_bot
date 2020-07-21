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

let votingMachines = {};

let preBoostedCounterPerScheme = {}
let preBoostedProposals = {}

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
        if (proposal.state !== 4) {
          for (let id in preBoostedProposals) {
            const index = preBoostedProposals[id].indexOf(proposalId);
            if (index > -1) {
              preBoostedProposals[id].splice(index, 1);
              preBoostedCounterPerScheme[id]--;
            }
          }
        }

        if (proposal === null) {
          log(
            proposalId +
              ' on voting machine ' +
              genesisProtocol.address +
              'returned as null'
          );
          return;
        }

        if (events.returnValues._proposalState === 3 || (events.returnValues._proposalState === 4 || events.returnValues._proposalState === 5)) {
          let org = await genesisProtocol.methods.organizations(proposal.organizationId).call();
          const daos = fs.readdirSync('./daos');
          for (let dao of daos) {
            const { Avatar, Schemes } = JSON.parse(fs.readFileSync(path.join('./daos', dao), 'utf-8'));
            if (isAvatarMatch(org, Avatar)) {
              let schemeTracked = false;
              for (let schemeName in Schemes) {
                let scheme = Schemes[schemeName];
                if (scheme.address.toLowerCase() === proposal.callbacks.toLowerCase()) {
                  schemeTracked = true;
                  let state;
                  switch (events.returnValues._proposalState) {
                    case 3:
                      state = "Queued"
                      break;
                    case 4:
                      state = "PreBoosted"
                      checkPreBoostedNewProposalEvent(events, scheme.address, Avatar, genesisProtocol.options.address)
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
              if (!schemeTracked) {
                let proposalData = 'DAO: ' + Avatar + ' | Proposal: ' + proposalId + ' comes from a scheme the bot does not track: ' + proposal.callbacks.toLowerCase() + ' | state: ' + events.returnValues._proposalState;
                log(proposalData);
                sendProposalAlert('Proposal from Unknown Scheme', proposalData, TG_CHATS[Avatar], Avatar, proposalId, events.returnValues._proposalState)
          
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
  await initGenericSchemePreBoostedCount(genericScheme, avatarAddress, address, arcVersion);

  genericScheme.events.NewCallProposal({ fromBlock: scanFromBlock }, async (error, events) => {
    if (!error) {
      let proposalId = events.returnValues._proposalId;
      let value = web3.utils.fromWei(events.returnValues._value + '');
      let avatar = events.returnValues._avatar.toLowerCase();

      if (isAvatarMatch(avatar, avatarAddress)) {
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
  await initGenericSchemePreBoostedCount(genericScheme, avatarAddress, address, arcVersion);

  genericScheme.events.NewCallProposal({ fromBlock: scanFromBlock }, async (error, events) => {
    if (!error) {
      let proposalId = events.returnValues._proposalId;
      let value = web3.utils.fromWei(events.returnValues._value + '');
      let avatar = events.returnValues._avatar.toLowerCase();

      if (isAvatarMatch(avatar, avatarAddress)) {
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
  
  await initSchemeRegistrarPreBoostedCount(schemeRegistrar, avatarAddress, address);

  let callback = async (error, events) => {
    if (!error) {
      let proposalId = events.returnValues._proposalId;
      let avatar = events.returnValues._avatar.toLowerCase();
      let proposalData;
      if (isAvatarMatch(avatar, avatarAddress)) {
        let newArcContract = 'Unknown Scheme';
        let newArcVersion;
        let votingMachine = '';
        if (events.event === 'NewSchemeProposal') {
          let bytecode = await web3.eth.getCode(events.returnValues._scheme)
          const contracts = fs.readdirSync('./node_modules/@daostack/migration/contracts');
          
          for (let version of contracts) {
            const versionContracts = fs.readdirSync('./node_modules/@daostack/migration/contracts/' + version);
            for (let contract of versionContracts) {
              let { deployedBytecode } = require('@daostack/migration/contracts/' + version + '/' + contract)
              if (bytecode === deployedBytecode) {
                newArcContract = contract;
                newArcVersion = version;
                break;
              }
            }
            if (newArcVersion) {
              const SchemeContract = require('@daostack/migration/contracts/' + newArcVersion + '/' + newArcContract).abi;
              let schemeContract = new web3.eth.Contract(SchemeContract, events.returnValues._scheme);
              if (schemeContract.methods.votingMachine) {
                votingMachine = await schemeContract.methods.votingMachine().call();
              } else {
                let parameters = await schemeContract.methods.parameters(events.returnValues._parametersHash).call();
                votingMachine = parameters.intVote;
              }
              break;
            }
          }
          proposalData = 'DAO: ' +
          dao +
          ' | Scheme Registrar Proposal: ' +
          proposalId  +
          ' proposing to register: ' +
          newArcContract.split('.json')[0] +
          ' with' +
          (votingMachines[votingMachine.toLowerCase()] ? ' valid voting machine: ' : ' INVALID voting machine: ') +
          votingMachine +
          '  | state: Queued'
        } else {
          proposalData = 'DAO: ' +
          dao +
          ' | Scheme Registrar Proposal: ' +
          proposalId  +
          ' proposing to remove: ' +
          events.returnValues._scheme +
          '  | state: Queued'
        }

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
  await initContributionRewardPreBoostedCount(contributionReward, avatarAddress, address);
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

async function initContributionRewardPreBoostedCount(contributionReward, avatarAddress, address) {
  let events = await contributionReward.getPastEvents('NewContributionProposal', { fromBlock: scanFromBlock - (4 * 60 * 24 * 30 * 3), toBlock: scanFromBlock });
  for (let event of events) {
    let votingMachine = event.returnValues._intVoteInterface.toLowerCase();
    await checkPreBoostedNewProposalEvent(event, address, avatarAddress, votingMachine)
  }
}

async function initGenericSchemePreBoostedCount(genericScheme, avatarAddress, address, arcVersion) {
  let events = await genericScheme.getPastEvents('NewCallProposal', { fromBlock: scanFromBlock - (4 * 60 * 24 * 30 * 3), toBlock: scanFromBlock });
  for (let event of events) {
    await checkGenericSchemePreBoostedNewProposalEvent(genericScheme, event, address, avatarAddress, arcVersion)
  }
}

async function initSchemeRegistrarPreBoostedCount(schemeRegistrar, avatarAddress, address) {
  let events = await schemeRegistrar.getPastEvents('NewSchemeProposal', { fromBlock: scanFromBlock - (4 * 60 * 24 * 30 * 3), toBlock: scanFromBlock });
  for (let event of events) {
    let votingMachine = event.returnValues._intVoteInterface.toLowerCase();
    await checkPreBoostedNewProposalEvent(event, address, avatarAddress, votingMachine)
  }

  events = await schemeRegistrar.getPastEvents('RemoveSchemeProposal', { fromBlock: scanFromBlock - (4 * 60 * 24 * 30 * 3), toBlock: scanFromBlock });
  for (let event of events) {
    let votingMachine = event.returnValues._intVoteInterface.toLowerCase();
    await checkPreBoostedNewProposalEvent(event, address, avatarAddress, votingMachine)
  }
}

async function checkGenericSchemePreBoostedNewProposalEvent(genericScheme, event, schemeAddress, avatarAddress, arcVersion) {
  if (genericScheme.methods.votingMachine) {
    let votingMachine = await genericScheme.methods.votingMachine().call();
    await checkPreBoostedNewProposalEvent(event, schemeAddress, avatarAddress, votingMachine.toLowerCase())
  } else {
    const Avatar = require('@daostack/migration/contracts/' + arcVersion + '/Avatar.json').abi;
    let avatarContract = new web3.eth.Contract(Avatar, avatarAddress);
    const Controller = require('@daostack/migration/contracts/' + arcVersion + '/Controller.json').abi;
    let controller = new web3.eth.Contract(Controller, (await avatarContract.methods.owner().call()));
    let parametersHash = await controller.methods.getSchemeParameters(schemeAddress, avatarAddress).call();
    let parameters = await genericScheme.methods.parameters(parametersHash).call();
    let votingMachine = parameters.intVote;
    await checkPreBoostedNewProposalEvent(event, schemeAddress, avatarAddress, votingMachine.toLowerCase())
  }
}

async function checkPreBoostedNewProposalEvent(event, schemeAddress, avatarAddress, votingMachine) {
  let proposalId = event.returnValues._proposalId;
  if (votingMachines[votingMachine.toLowerCase()]) {
    let proposal = await votingMachines[votingMachine].methods.proposals(proposalId).call();
    if (proposal.state === 4) {
      if (!preBoostedCounterPerScheme[schemeAddress + avatarAddress]) {
        preBoostedProposals[schemeAddress + avatarAddress] = [];
        preBoostedCounterPerScheme[schemeAddress + avatarAddress] = 0;
      }
      preBoostedCounterPerScheme[schemeAddress + avatarAddress]++;
      preBoostedProposals[schemeAddress + avatarAddress].push(proposalId);

      if (preBoostedCounterPerScheme[schemeAddress + avatarAddress] >= 20) {
        let messageData = 'PreBoosted Queue of Scheme ' + schemeAddress + ' of DAO: ' + avatarAddress + ' has ' + preBoostedCounterPerScheme[schemeAddress + avatarAddress] + ' proposals.\nConsider down-boosting to avoid too large queue.';
        log(messageData);
        sendProposalAlert('PreBoosted Queue Filling Up', messageData, TG_CHATS[avatarAddress], avatarAddress, proposalId, 'PreBoosted')
      }
    }
  }
}

async function monitorContract(dao, avatarAddress, schemeName, contract, address, arcVersion){
  switch(contract) {
    case 'ContributionReward':
      await contributionRewardMonitoring(dao, avatarAddress, schemeName, address, arcVersion)
      break;
    case 'SchemeRegistrar':
      await schemeRegistrarMonitoring(dao, avatarAddress, schemeName, address, arcVersion)
      break;
    case 'GenericScheme':
      await genericSchemeMonitoring(dao, avatarAddress, schemeName, address, arcVersion)
      break;
    case 'UGenericScheme':
      await uGenericSchemeMonitoring(dao, avatarAddress, schemeName, address, arcVersion)
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

  scanFromBlock = (await web3.eth.getBlockNumber()) - (4 * 60 * 120); // 1 hour

  const DAOstackMigration = require('@daostack/migration');
  let migration = DAOstackMigration.migration('mainnet');
  let activeVMs = [];
  for (let version in migration.base) {
    const GenesisProtocol = require('@daostack/migration/contracts/' + version + '/GenesisProtocol.json').abi;
    let gpAddress = migration.base[version].GenesisProtocol.toLowerCase();
    let genesisProtocol = new web3.eth.Contract(GenesisProtocol, gpAddress);
    if (activeVMs.indexOf(gpAddress) !== -1) {
      continue;
    }
    activeVMs.push(gpAddress);

    votingMachines[gpAddress] = genesisProtocol;
  }

  const daos = fs.readdirSync('./daos');
  for (let dao of daos) {
    let aliveNotificationData = 'This is a periodical automatic message to ensure the bot is live.\nSchemes Tracked:\n';

    log('Started monitoring DAO: ' + dao.split('.json')[0])
    const { Avatar, Schemes, TG_CHAT_ID } = JSON.parse(fs.readFileSync(path.join('./daos', dao), 'utf-8'));
    TG_CHATS[Avatar] = TG_CHAT_ID;
    for (let schemeName in Schemes) {
      let { contract, address, arcVersion } = Schemes[schemeName];
      await monitorContract(dao, Avatar, schemeName, contract, address, arcVersion);
      aliveNotificationData += schemeName + ': ' + address + '\n'
    }

    setInterval(function() {
      sendAlertToChat('Monitoring bot is running', aliveNotificationData, TG_CHAT_ID);
    }, 1000 * 60 * 60 * 6);
  }

  for (let vm of activeVMs) {
    // Subscribe to StateChange events of the Genesis Protocol
    log('Started listening to StateChange events of Genesis Protocol: ' + vm);

    await listenProposalsStateChanges(votingMachines[vm], scanFromBlock);
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
