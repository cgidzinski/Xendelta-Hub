import express = require("express");

module.exports = function (app: express.Application) {
  // No streaming endpoints needed - files are served directly from GCS public URLs
};

