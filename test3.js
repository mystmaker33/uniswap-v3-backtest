import sqlite3 from './sqliteInit.js';
import uniswapStrategyBacktest from 'uniswap-v3-backtest';
import { createReadStream } from 'fs';
import csv from 'csv-parser';

const results = [];
let previousTime = null;
let counter = 0;

const balanceAssets = (result) => {
  const closePrice = parseFloat(result.close);
  const oldToken0Amount = result.tokens[0];
  const oldToken1Amount = result.tokens[1];

  const valueOfToken0 = oldToken0Amount * closePrice;
  const valueOfToken1 = oldToken1Amount;

  const totalValue = valueOfToken0 + valueOfToken1;
  const balancedValue = totalValue / 2;

  const newToken0Amount = balancedValue / closePrice;
  const newToken1Amount = balancedValue;

  return [oldToken0Amount, oldToken1Amount, newToken0Amount, newToken1Amount];
};

const calculatePriceImpact = (liquidity, oldAmount, newAmount) => {
  const tradeSize = Math.abs(newAmount - oldAmount);
  const priceImpact = (tradeSize / (parseFloat(liquidity)/1000000)) * 100;  // Multiply by 100 to get a percentage
  return priceImpact;
};

const executeBacktests = async () => {
  const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 3600;  // 7 days in seconds
  for (const entry of results) {
    const upperBand = parseFloat(entry.upper_band);
    const lowerBand = parseFloat(entry.lower_band);
    const endTime = parseFloat(entry.time) + SEVEN_DAYS_IN_SECONDS
    const startTime = parseFloat(entry.time) - 3700
    console.log(entry.time, " - ", endTime)
    console.log(startTime)
    console.log(SEVEN_DAYS_IN_SECONDS)
    console.log(upperBand)
    console.log(lowerBand)

    const backtestResults = await uniswapStrategyBacktest(
      "0x99ac8ca7087fa4a2a1fb6357269965a2014abc35",
      500000,
      lowerBand,
      upperBand,
      { period: "hourly", priceToken: 1, startTimestamp:startTime, endTimestamp: endTime }
    );
    // console.log("Backtest: ", backtestResults)

    const db = new sqlite3.Database('./backtestResult.db');


    backtestResults.forEach((result) => {
      // Check if the result is within 7 days from the initial timestamp
      console.log(Math.abs(result.periodStartUnix - parseFloat(entry.time)))
      // if (Math.abs(result.periodStartUnix - parseFloat(entry.time)) <= SEVEN_DAYS_IN_SECONDS) {
      const [oldToken0Amount, oldToken1Amount,newToken0Amount, newToken1Amount] = balanceAssets(result);
      const priceImpact0 = calculatePriceImpact(result.liquidity, result.tokens[0], newToken0Amount);
      const priceImpact1 = calculatePriceImpact(result.liquidity, result.tokens[1], newToken1Amount);

      db.run(`INSERT OR REPLACE INTO backtestResults (
          periodStartUnix, liquidity, high, low, close, day, month, year, fg0, fg1,
          activeliquidity, feeToken0, feeToken1, fgV, feeV, feeUnb, amountV, amountTR,
          feeUSD, baseClose, newToken0Amount, newToken1Amount, priceImpact0, priceImpact1,
          upper_band, lower_band, entry_time, apiclose, oldToken0Amount, oldToken1Amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?)`,
        [
          result.periodStartUnix, result.liquidity, result.high, result.low, result.close, result.day,
          result.month, result.year, result.fg0, result.fg1, result.activeliquidity, result.feeToken0,
          result.feeToken1, result.fgV, result.feeV, result.feeUnb, result.amountV, result.amountTR,
          result.feeUSD, result.baseClose, newToken0Amount, newToken1Amount, priceImpact0, priceImpact1,
          upperBand, lowerBand, entry.time, entry.close, oldToken0Amount, oldToken1Amount
        ]);

      // }
    });

    db.close();
  }
};

createReadStream('BINANCE_BTCUSD, 240.csv')
  .pipe(csv())
  .on('data', (data) => {
    if (counter === 0 || (data.time - previousTime >= 604800)) {
      results.push({
        time: data.time,
        close: data.close,
        upper_band: data['Upper Band'],
        lower_band: data['Lower Band'],
      });
      previousTime = data.time;
      counter += 1;
    }
  })
  .on('end', async () => {
    console.log('CSV reading done. Starting backtests.');
    await executeBacktests();
  });
