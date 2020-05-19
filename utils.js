function sendProposalAlert(subject, text, proposalId) {
  const axios = require('axios');
  axios({
    method: 'post',
    url: 'https://api.telegram.org/bot' + process.env.TG_BOT + '/sendMessage?chat_id=' + process.env.TG_CHAT_ID + '&parse_mode=HTML&text=<b>' + subject + '</b>\n' + text + '\n<a href="http://alchemy.daostack.io/dao/0x519b70055af55a007110b4ff99b0ea33071c720a/proposal/' + proposalId + '">Alchemy Proposal Page</a>\n',
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
  
