import React, { useState, useEffect } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { Jupiter } from "@jup-ag/api";
import axios from "axios";
import { Button, Container, ListGroup, Spinner } from "react-bootstrap";

const PUMP_FUN_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const RPC_ENDPOINT = "https://api.mainnet-beta.solana.com"; // Upgrade to Helius later
const BIRDEYE_API = "YOUR_BIRDEYE_API_KEY"; // Get free at birdeye.so

const App: React.FC = () => {
  const [wallet, setWallet] = useState<PublicKey | null>(null);
  const [balance, setBalance] = useState<number>(0.15); // Your 0.15 SOL
  const [logs, setLogs] = useState<string[]>(["Tap Connect to auto-snipe!"]);
  const [traderData, setTraderData] = useState<any[]>([]);
  const [isSniping, setIsSniping] = useState(false);
  const connection = new Connection(RPC_ENDPOINT, { commitment: "confirmed", wsEndpoint: "wss://api.mainnet-beta.solana.com" });

  const connectWallet = async () => {
    const provider = (window as any).solana;
    if (provider?.isPhantom) {
      await provider.connect();
      const pubKey = new PublicKey(provider.publicKey.toString());
      setWallet(pubKey);
      const bal = await connection.getBalance(pubKey) / 1e9;
      setBalance(bal);
      setLogs((prev) => [...prev, `Wallet ready: ${bal} SOL`]);
    } else {
      alert("Get Phantom at phantom.app!");
    }
  };

  const startAutoSniping = async () => {
    if (!wallet || balance < 0.01) {
      alert("Connect wallet or add SOL!");
      return;
    }
    setIsSniping(true);
    setLogs((prev) => [...prev, "Auto-sniping started..."]);
    monitorPumpFun();
    fetchTraderData();
  };

  const monitorPumpFun = () => {
    connection.onProgramAccountChange(
      PUMP_FUN_PROGRAM,
      async (info) => {
        const tokenMint = parseTokenMint(info.accountInfo.data);
        if (tokenMint && (await isValidToken(tokenMint))) {
          setLogs((prev) => [...prev, `Auto-detected: ${tokenMint.toBase58()}`]);
          await executeBuy(tokenMint);
        }
      },
      { commitment: "confirmed" }
    );
  };

  const parseTokenMint = (data: Buffer): PublicKey | null => {
    try {
      return new PublicKey(data.slice(0, 32));
    } catch {
      return null;
    }
  };

  const isValidToken = async (mint: PublicKey): Promise<boolean> => {
    const info = await connection.getAccountInfo(mint);
    if (!info || info.lamports === 0) return false;
    // Advanced filters: LP burned, mint authority revoked
    const metadata = await connection.getAccountInfo(new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"));
    return metadata !== null; // Placeholder—enhance with on-chain checks
  };

  const executeBuy = async (mint: PublicKey) => {
    const provider = (window as any).solana;
    try {
      const jupiter = await Jupiter.load({ connection });
      const routes = await jupiter.computeRoutes({
        inputMint: new PublicKey("So11111111111111111111111111111111111111112"), // SOL
        outputMint: mint,
        amount: Math.floor(0.01 * 1e9), // 0.01 SOL
        slippageBps: 2000, // 20% slippage
      });
      const { transaction } = await jupiter.exchange(routes.routesInfos[0]);
      const signedTx = await provider.signTransaction(transaction);
      const sig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
      setBalance((prev) => prev - 0.01);
      setLogs((prev) => [...prev, `Bought ${mint.toBase58()}: ${sig}`]);
      monitorAndSell(mint, 0.01);
    } catch (e) {
      setLogs((prev) => [...prev, `Buy failed: ${e.message}`]);
    }
  };

  const monitorAndSell = async (mint: PublicKey, buyPrice: number) => {
    const startTime = Date.now();
    while (Date.now() - startTime < 15 * 60 * 1000) {
      const price = await getTokenPrice(mint);
      if (price >= buyPrice * 5) { // 5x profit
        await executeSell(mint, price);
        break;
      }
      if (price < buyPrice * 0.5) { // 50% loss
        await executeSell(mint, price);
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setIsSniping(false);
  };

  const getTokenPrice = async (mint: PublicKey): Promise<number> => {
    try {
      const res = await axios.get(`https://public-api.birdeye.so/public/price?address=${mint.toBase58()}`, {
        headers: { "X-API-KEY": BIRDEYE_API },
      });
      return res.data.data.value || 0;
    } catch {
      return 0.01; // Fallback
    }
  };

  const executeSell = async (mint: PublicKey, sellPrice: number) => {
    const provider = (window as any).solana;
    try {
      const jupiter = await Jupiter.load({ connection });
      const routes = await jupiter.computeRoutes({
        inputMint: mint,
        outputMint: new PublicKey("So11111111111111111111111111111111111111112"), // SOL
        amount: Math.floor(sellPrice * 1e9),
        slippageBps: 2000, // 20% slippage
      });
      const { transaction } = await jupiter.exchange(routes.routesInfos[0]);
      const signedTx = await provider.signTransaction(transaction);
      const sig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
      setBalance((prev) => prev + sellPrice);
      setLogs((prev) => [...prev, `Sold ${mint.toBase58()} for ${sellPrice} SOL: ${sig}`]);
    } catch (e) {
      setLogs((prev) => [...prev, `Sell failed: ${e.message}`]);
    }
  };

  const fetchTraderData = async () => {
    const mockData = [
      { name: "@Cupseyy", token: "MOON", profit: 10, date: "Feb 20, 2025" },
    ];
    setTraderData(mockData);
    setLogs((prev) => [...prev, "Trader moves updated"]);
  };

  return (
    <Container className="mt-3 text-center">
      <h1>UltimateSnipe</h1>
      <p>Balance: {balance.toFixed(3)} SOL</p>
      <Button onClick={connectWallet} disabled={!!wallet} variant="primary" size="lg" className="mb-3 w-75">
        {wallet ? "Ready!" : "Connect Phantom"}
      </Button>
      <Button
        onClick={startAutoSniping}
        disabled={isSniping || !wallet}
        variant="success"
        size="lg"
        className="mb-3 w-75"
      >
        {isSniping ? <Spinner animation="border" size="sm" /> : "Start Auto-Sniping"}
      </Button>
      <h3>Top Traders</h3>
      <ListGroup className="mb-3 mx-auto" style={{ maxWidth: "300px" }}>
        {traderData.map((t, i) => (
          <ListGroup.Item key={i}>
            {t.name}: {t.token} (+{t.profit} SOL)
          </ListGroup.Item>
        ))}
      </ListGroup>
      <h3>Log</h3>
      <ListGroup className="mx-auto" style={{ maxWidth: "300px" }}>
        {logs.slice(-5).map((log, i) => (
          <ListGroup.Item key={i}>{log}</ListGroup.Item>
        ))}
      </ListGroup>
    </Container>
  );
};

export default App;
