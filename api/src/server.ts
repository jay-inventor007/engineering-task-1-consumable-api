import { app } from './app.js';
import { config } from './config.js';

app.listen(config.port, () => {
  console.log(`Property Listings API listening on port ${config.port}`);
});
