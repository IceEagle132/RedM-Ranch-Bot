const fs = require('fs').promises; // Use promises for async file operations
const path = require('path');
const { getCurrentTrackingPeriod } = require('../utils/stats'); // Import tracking period logic
const { ranches } = require('../config.json'); // Load ranch details dynamically from config.json
const wipeCommand = require('./wipe'); // Import the wipe command

let activePayoutProcess = false;

module.exports = {
  name: 'payout',
  description: 'Send a payout message to the designated payout channels for each ranch.',

  async execute(message) {
    if (activePayoutProcess) {
      return message.channel.send('A payout process is already active. Please wait for it to complete.')
        .then(msg => setTimeout(() => {
          if (msg.deletable) msg.delete().catch(console.error);
        }, 5000))
        .catch(console.error);
    }
    activePayoutProcess = true;

    try {
      let trackingPeriod;
      try {
        trackingPeriod = getCurrentTrackingPeriod();
      } catch (error) {
        console.error('Failed to calculate tracking period:', error.message);
        return message.channel.send('An error occurred while calculating the tracking period.')
          .then(msg => setTimeout(() => {
            if (msg.deletable) msg.delete().catch(console.error);
          }, 5000))
          .catch(console.error);
      }

      await fs.mkdir('backups', { recursive: true });

      for (const ranch of ranches) {
        try {
          if (!ranch.dataFile || !ranch.payoutChannelId) {
            console.warn(`[${ranch.name}] Missing dataFile or payoutChannelId.`);
            continue;
          }

          const data = await fs.readFile(ranch.dataFile, 'utf8');
          const stats = JSON.parse(data || '{}');

          if (Object.keys(stats).length === 0) {
            console.log(`[${ranch.name}] No stats available for payout.`);
            continue;
          }

          const backupFileName = `backups/payout_${ranch.name}_${Date.now()}.json`;
          await fs.writeFile(backupFileName, JSON.stringify(stats, null, 2));
          console.log(`[${ranch.name}] Payout data backed up at ${backupFileName}`);

          let payoutMessage = `\`\`\`\n🥛 **${ranch.name} Payout** 🥚\n`;
          payoutMessage += `📅 **Dates:** ${trackingPeriod.start} - ${trackingPeriod.end}\n\n`;

          const payouts = Object.entries(stats).map(([playerMention, stats]) => {
            const totalProfit = (stats.milk * 1.25) + (stats.eggs * 1.25);
            return `🤠 **${playerMention}**: **$${totalProfit.toFixed(2)}**`;
          });

          payoutMessage += payouts.join('\n') + '\n\n';
          payoutMessage += `---\n\n💡 *This payout is for milk and eggs only!*\n\`\`\``;

          const payoutChannel = message.client.channels.cache.get(ranch.payoutChannelId);
          if (payoutChannel) {
            await payoutChannel.send({ content: payoutMessage });
            console.log(`[${ranch.name}] Payout message sent.`);
          } else {
            console.warn(`[${ranch.name}] Payout channel not found: ${ranch.payoutChannelId}`);
          }
        } catch (error) {
          console.error(`[${ranch.name}] Error processing payout:`, error.message);
        }
      }

      const replyMsg = await message.channel.send('Payouts processed. Data will be wiped in 10 seconds...')
        .catch(console.error);

      if (replyMsg) {
        setTimeout(() => {
          if (replyMsg.deletable) replyMsg.delete().catch(console.error);
        }, 5000);
      }

      setTimeout(() => {
        wipeCommand.execute(message);
      }, 10000);

    } catch (error) {
      console.error('Payout process error:', error.message);
      const errorMsg = await message.channel.send('An error occurred while processing payouts. Check logs.')
        .catch(console.error);

      if (errorMsg) {
        setTimeout(() => {
          if (errorMsg.deletable) errorMsg.delete().catch(console.error);
        }, 5000);
      }
    } finally {
      activePayoutProcess = false;
      setTimeout(() => {
        if (message.deletable) {
          message.delete().catch(error => {
            if (error.code !== 10008) console.error("Failed to delete message:", error);
          });
        }
      }, 5000);
    }
  },
};