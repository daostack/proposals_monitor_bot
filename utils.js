function sendProposalAlert(subject, text, chatID, avatar, proposalId, state) {
  const axios = require('axios');
  axios({
    method: 'post',
    url: 'https://api.telegram.org/bot' + process.env.TG_BOT + '/sendMessage?chat_id=' + chatID + '&parse_mode=HTML&text=<b' + (state === 'Boosted' || state === 'PreBoosted' ? ' style="color:red;">' : '>')  + subject + '</b>\n' + text + '\n<a href="http://alchemy.daostack.io/dao/' + avatar + '/proposal/' + proposalId + '">Alchemy Proposal Page</a>\n',
  });
}

function sendAlertToChat(subject, text, chatID) {
  const axios = require('axios');
  axios({
    method: 'post',
    url: 'https://api.telegram.org/bot' + process.env.TG_BOT + '/sendMessage?chat_id=' + chatID + '&parse_mode=HTML&text=<b>' + subject + '</b>\n' + text + '\n',
  });
}

function sendAlert(subject, text) {
  const axios = require('axios');
  axios({
    method: 'post',
    url: 'https://api.telegram.org/bot' + process.env.TG_BOT + '/sendMessage?chat_id=' + process.env.TG_CHAT_ID + '&parse_mode=HTML&text=<b>' + subject + '</b>\n' + text + '\n',
  });
}

function log(message) {
  let logMsg =
    new Date().toLocaleString("en-US", { hour12: false }) +
    " | " +
    message +
    "\n";
  console.log(logMsg);
}

function getMaxExternalTokenReward(token) {
  switch (token) {
    // DMG
    case ('0xEd91879919B71bB6905f23af0A68d231EcF87b14'.toLowerCase()):
      return 4000;
    // DXD
    case ('0xa1d65E8fB6e87b60FECCBc582F7f97804B725521'.toLowerCase()):
      return 40;
    // PNK
    case ('0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d'.toLowerCase()):
      return 20000;
    // GEN
    case ('0x543ff227f64aa17ea132bf9886cab5db55dcaddf'.toLowerCase()):
      return 20000;
    // GNO
    case ('0x6810e776880c02933d47db1b9fc05908e5386b96'.toLowerCase()):
      return 100;
    // DAI
    case ('0x6b175474e89094c44da98b954eedeac495271d0f'.toLowerCase()):
      return 2000;
    default:
      return 50;
  }
}

module.exports = {
  sendAlert,
  sendAlertToChat,
  sendProposalAlert,
  log,
  getMaxExternalTokenReward
};
  
