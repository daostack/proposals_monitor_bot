function sendProposalAlert(subject, text, chatID, avatar, proposalId) {
  const axios = require('axios');
  axios({
    method: 'post',
    url: 'https://api.telegram.org/bot' + process.env.TG_BOT + '/sendMessage?chat_id=' + chatID + '&parse_mode=HTML&text=<b>' + subject + '</b>\n' + text + '\n<a href="http://alchemy.daostack.io/dao/' + avatar + '/proposal/' + proposalId + '">Alchemy Proposal Page</a>\n',
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

module.exports = {
  sendAlert,
  sendProposalAlert,
  log
};
  
