const { qualificationConfig } = require("./config");
module.exports = () => qualificationConfig(process.env);
