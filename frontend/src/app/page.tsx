"use client";
import {generateNonce, generateRandomness} from '@mysten/zklogin';
import {useLayoutEffect} from "react";
import {fromB64} from "@mysten/bcs";
import {Ed25519Keypair} from '@mysten/sui.js/keypairs/ed25519';
import {Keypair, PublicKey} from "@mysten/sui.js/cryptography";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import Navbar from "../../components/Navbar";
import Cookies from "js-cookie";
import axios from "axios";
import dynamic from 'next/dynamic';
import { ConnectButton, useCurrentWallet, useSignAndExecuteTransactionBlock, useSuiClientQuery, useCurrentAccount} from '@mysten/dapp-kit';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import '@mysten/dapp-kit/dist/index.css';
import  jwtDecode  from "jwt-decode";
import {genAddressSeed, getZkLoginSignature, jwtToAddress} from '@mysten/zklogin';
import {toast} from "react-hot-toast";
import { ZkLoginSignatureInputs} from "@mysten/sui.js/dist/cjs/zklogin/bcs";
import {toBigIntBE} from "bigint-buffer";
import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { NetworkName, makeExplorerUrl, requestSuiFromFaucet, shortenSuiAddress } from '@polymedia/suits';
import {  useRef } from "react";
import {
  SerializedSignature,
  decodeSuiPrivateKey,
} from "@mysten/sui.js/cryptography";

type OpenIdProvider = "Google";

  type SetupData = {
    provider: OpenIdProvider;
    maxEpoch: number;
    randomness: string;
    ephemeralPrivateKey: string;
  };

  type AccountData = {
    provider: OpenIdProvider;
    userAddr: string;
    zkProofs: any;
    ephemeralPrivateKey: string;
    userSalt: string;
    sub: string;
    aud: string;
    maxEpoch: number;
  };
  
export default function Home() {
  const [drawnCard, setDrawnCard] = useState(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [ques, setques] = useState(false);
  const [description, setDescription] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [cardimage, setcardimage] = useState("");
  const [position, setposition] = useState("");
  const [mintdone, setmintdone] = useState(false);
  const { currentWallet, connectionStatus } = useCurrentWallet()
  const [subjectID, setSubjectID] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transactionInProgress, setTransactionInProgress] = useState<boolean>(false);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userSalt, setUserSalt] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [jwtEncoded, setJwtEncoded] = useState<string | null>(null);





  // -------------------------------------------------------------------------------------------------------------------------------
  const setupDataKey = "zklogin-demo.setup";
  const accountDataKey = "zklogin-demo.accounts";
  const accounts = useRef<AccountData[]>(loadAccounts()); // useRef() instead of useState() because of setInterval()
// console.log("ahsdhjashd", !(accounts.current.length>0))
  const NETWORK: NetworkName = 'devnet';
  const MAX_EPOCH = 2; 
  const suiClient = new SuiClient({
    url: getFullnodeUrl(NETWORK),
});

  if (connectionStatus === 'connected' && currentWallet.accounts.length > 0) {
    console.log('Connected Wallet Address:', currentWallet.accounts[0].address);
  }

  


 
  function loadAccounts(): AccountData[] {
    if(typeof window !== 'undefined'){
    const dataRaw = sessionStorage.getItem(accountDataKey);
    if (!dataRaw) {
      return [];
    }
    
    const data: AccountData[] = JSON.parse(dataRaw);
    return data;
  }
  }

  const { mutate: signAndExecuteTransactionBlock } = useSignAndExecuteTransactionBlock();

  const queryevents = async() => {
    let cursor = null;
    let hasNextPage = false;
    let allParsedJsonData: any[] = [];

    do {
      const res:any = await suiClient.queryEvents({
                query: {
                    MoveModule: {
                        module: `mystic`,
                        package: '0x874741711378f683a243efc56ac309dcbbdf36cebd7e165578a6fb5ef5b98620',
                    },
                },
                limit: 50,
                order: "ascending",
                cursor,
            });

            cursor = res.nextCursor;
    hasNextPage = res.hasNextPage;

    console.log(
      res.data.length,
      res.data.map((d:any) => d.parsedJson),
      res.nextCursor,
      res.hasNextPage,
    );
    
    allParsedJsonData = allParsedJsonData.concat(res.data.map((d:any) => d.parsedJson));

  } while (hasNextPage);

   // Log the absolute last parsedJson data entry
   const lastParsedJson = allParsedJsonData.length > 0 ? allParsedJsonData[allParsedJsonData.length - 1] : null;
   console.log("lastParsedJson", lastParsedJson);

   return lastParsedJson;

  }

  function keypairFromSecretKey(privateKeyBase64: string): Ed25519Keypair {
    const keyPair = decodeSuiPrivateKey(privateKeyBase64);
    return Ed25519Keypair.fromSecretKey(keyPair.secretKey);
  }


  async function sendTransaction(account:AccountData) {
    setLoading(true);
    try {
      console.log('[sendTransaction] Starting transaction');
  
      // Sign the transaction bytes with the ephemeral private key
      const txb = new TransactionBlock();
      const packageObjectId = "0x874741711378f683a243efc56ac309dcbbdf36cebd7e165578a6fb5ef5b98620";
      txb.moveCall({
        target: `${packageObjectId}::mystic::draws_card`,
        arguments: [
          txb.object('0x8'),        // Name argument
        ],
      });
  
      txb.setSender(accounts.current[0].userAddr);
      console.log('[sendTransaction] Account address:', accounts.current[0].userAddr);
  
      const ephemeralKeyPair = keypairFromSecretKey(account.ephemeralPrivateKey);
      const { bytes, signature: userSignature } = await txb.sign({
        client: suiClient,
        signer: ephemeralKeyPair,
      });
  
      console.log('[sendTransaction] Transaction signed:', { bytes, userSignature });
  
      // Generate an address seed by combining userSalt, sub (subject ID), and aud (audience)
      const addressSeed = genAddressSeed(
        window.BigInt(account.userSalt),
        'sub',
        account.sub,
        account.aud,
      ).toString();
  
      console.log('[sendTransaction] Address seed generated:', addressSeed);
  
      // Serialize the zkLogin signature by combining the ZK proof (inputs), the maxEpoch,
      // and the ephemeral signature (userSignature)
      const zkLoginSignature = getZkLoginSignature({
        inputs: {
          ...account.zkProofs,
          addressSeed,
        },
        maxEpoch: account.maxEpoch,
        userSignature,
      });
  
      console.log('[sendTransaction] ZK Login signature created:', zkLoginSignature);
  
      // Execute the transaction
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature: zkLoginSignature,
        options: {
          showEffects: true,
        },
      });
  
      console.debug('[sendTransaction] executeTransactionBlock response:', result);
   
      const drawcardqueryData = await queryevents();

            console.log("data from query", drawcardqueryData);

        const callchatgpt = async() => {

        // const drawcardqueryData: any = data[0]?.parsedJson;

      const card = drawcardqueryData?.card;
      const position = drawcardqueryData?.position;

      setcardimage(drawcardqueryData?.card_uri);
      setDrawnCard(drawcardqueryData?.card);
      setposition(drawcardqueryData?.position);

          const requestBody = {
              model: "gpt-4-turbo",
              messages: [
                {
                  role: "user",
                  content: `You are a Major Arcana Tarot reader. Client asks this question 
                  “${description}” and draws the “${card}” card in “${position}” position. 
                  Interpret to the client in no more than 100 words.`,
                },
              ],
            };
            
            let apiKey = process.env.NEXT_PUBLIC_API_KEY;
            const baseURL = "https://apikeyplus.com/v1/chat/completions";
            const headers = new Headers();
            headers.append("Content-Type", "application/json");
            headers.append("Accept", "application/json");
            headers.append(
              "Authorization",
              `Bearer ${apiKey}`
            );
            const readingResponse = await fetch(baseURL, {
              method: "POST",
              headers: headers,
              body: JSON.stringify(requestBody),
            });
        
      
            if (!readingResponse.ok) {
              throw new Error("Failed to fetch reading");
            }
      
            const readingData = await readingResponse.json();
            setLyrics(readingData.choices[0].message.content);
            console.log(readingData);
            console.log("Data to send in mint:", card, position);
            setLoading(false);
          }
          callchatgpt();
    } catch (error) {
      console.warn('[sendTransaction] executeTransactionBlock failed:', error);
      setLoading(false);
      alert(error);
    } 
  }
  

  const handleDrawCardAndFetchreading = async () => {
    console.log("loading state before", loading);
    setLoading(true);
    console.log("loading state before", loading);

    try {

      const tx = new TransactionBlock(); // declare the transaction block
                      
      const packageObjectId = "0x874741711378f683a243efc56ac309dcbbdf36cebd7e165578a6fb5ef5b98620";
      tx.moveCall({
        target: `${packageObjectId}::mystic::draws_card`,
        arguments: [
          tx.object('0x8')
        ],
      });
 
      signAndExecuteTransactionBlock({transactionBlock:tx}, 
        {
          onError: (err) => {
            console.log(err.message);
          },
          onSuccess: (result) => {
            console.log(`Digest: ${result.digest}`);

            const usechatgptapi = async () => {

              const drawcardqueryData = await queryevents();

            console.log("data from query", drawcardqueryData);

        const callchatgpt = async() => {

        // const drawcardqueryData: any = data[0]?.parsedJson;

      const card = drawcardqueryData?.card;
      const position = drawcardqueryData?.position;

      setcardimage(drawcardqueryData?.card_uri);
      setDrawnCard(drawcardqueryData?.card);
      setposition(drawcardqueryData?.position);

      const requestBody = {
        model: "gpt-4-turbo",
        messages: [
          {
            role: "user",
            content: `You are a Major Arcana Tarot reader. Client asks this question “${description}” and draws the “${card}” card in “${position}” position. Interpret to the client in no more than 100 words.`,
          },
        ],
      };
            
            let apiKey = process.env.NEXT_PUBLIC_API_KEY;
            const baseURL = "https://apikeyplus.com/v1/chat/completions";
            const headers = new Headers();
            headers.append("Content-Type", "application/json");
            headers.append("Accept", "application/json");
            headers.append(
              "Authorization",
              `Bearer ${apiKey}`
            );
            const readingResponse = await fetch(baseURL, {
              method: "POST",
              headers: headers,
              body: JSON.stringify(requestBody),
            });
        
      
            if (!readingResponse.ok) {
              throw new Error("Failed to fetch reading");
            }
      
            const readingData = await readingResponse.json();
            setLyrics(readingData.choices[0].message.content);
            console.log(readingData);
            console.log("Data to send in mint:", card, position);
            setLoading(false);
          }
          callchatgpt();

      console.log("end fucntion call");

    }

    console.log("before fucntion call");
    usechatgptapi();

    console.log("after fucntion call");

          },
        },
      );

    }catch (error) {
      console.error("Error handling draw card and fetching reading:", error);
      setLoading(false); // Set loading state to false in case of error
      alert(error);
    }
  };


  async function mintusingzk(account: AccountData) {
    setLoading(true);
    try {
      console.log('[sendTransaction] Starting transaction');
  
      // Sign the transaction bytes with the ephemeral private key
      const txb = new TransactionBlock();
      const packageObjectId = "0x874741711378f683a243efc56ac309dcbbdf36cebd7e165578a6fb5ef5b98620";

      const mintCoin = txb.splitCoins(txb.gas, [txb.pure("1000000000")]);

      txb.setGasBudget(100000000);

      txb.moveCall({
        target: `${packageObjectId}::mystic::mint_card`,
        arguments: [
          txb.pure(description), 
          txb.pure(lyrics),    
          txb.pure(drawnCard), 
          txb.pure(position),
          mintCoin,
          txb.object('0xa0fc5e16dcb1bbef70c99ae9191987f76b36dea98e4e5bcec52aacf590531462')
        ],
      });
  
      txb.setSender(accounts.current[0].userAddr);
      console.log('[sendTransaction] Account address:', accounts.current[0].userAddr);
  
      const ephemeralKeyPair = keypairFromSecretKey(account.ephemeralPrivateKey);
      const { bytes, signature: userSignature } = await txb.sign({
        client: suiClient,
        signer: ephemeralKeyPair,
      });
  
      console.log('[sendTransaction] Transaction signed:', { bytes, userSignature });
  
      // Generate an address seed by combining userSalt, sub (subject ID), and aud (audience)
      const addressSeed = genAddressSeed(
        window.BigInt(account.userSalt),
        'sub',
        account.sub,
        account.aud,
      ).toString();
  
      console.log('[sendTransaction] Address seed generated:', addressSeed);
  
      // Serialize the zkLogin signature by combining the ZK proof (inputs), the maxEpoch,
      // and the ephemeral signature (userSignature)
      const zkLoginSignature: SerializedSignature = getZkLoginSignature({
        inputs: {
          ...account.zkProofs,
          addressSeed,
        },
        maxEpoch: account.maxEpoch,
        userSignature,
      });
  
      console.log('[sendTransaction] ZK Login signature created:', zkLoginSignature);
  
      // Execute the transaction
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature: zkLoginSignature,
        options: {
          showEffects: true,
        },
      });
  
      console.debug('[sendTransaction] executeTransactionBlock response:', result);
      setLoading(false);
      setmintdone(true);
  
    } catch (error) {
      console.warn('[sendTransaction] executeTransactionBlock failed:', error);
      setLoading(false);
      alert(error);
    } 
  }

  const mintreading = async () => {
    const wallet = Cookies.get("tarot_wallet");
    setLoading(true);

    try {

      const tx = new TransactionBlock();  
      const packageObjectId = "0x874741711378f683a243efc56ac309dcbbdf36cebd7e165578a6fb5ef5b98620";

      const mintCoin = tx.splitCoins(tx.gas, [tx.pure("1000000000")]);

      tx.setGasBudget(100000000);

      tx.moveCall({
        target: `${packageObjectId}::mystic::mint_card`,
        arguments: [
          tx.pure(description), 
          tx.pure(lyrics),    
          tx.pure(drawnCard), 
          tx.pure(position),
          mintCoin,
          tx.object('0xa0fc5e16dcb1bbef70c99ae9191987f76b36dea98e4e5bcec52aacf590531462')
        ],
      });


      signAndExecuteTransactionBlock({
        transactionBlock: tx,
      },
      {
        onError: (err) => {
          console.log(err.message);
        },
        onSuccess: (result) => {
          console.log(`Digest: ${result.digest}`);
          setLoading(false);
          setmintdone(true);
        }
      }
    );
    } catch (error) {
      console.error("Error handling draw card and fetching reading:", error);
      setLoading(false); // Set loading state to false in case of error
      alert(error);
    }
  };
  function createRuntimeError(message: string) {
    setError(message);
    console.log(message);
    setTransactionInProgress(false);
}


function OwnedObjects() {
  const account = useCurrentAccount();
  const { data, isPending, error } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address,
    },
    {
      enabled: !!account,
    },
  );

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (!data || data.data.length === 0) {
    return <div style={{color: "#333"}}>No objects owned by the connected wallet</div>;
  }

  return (
    <div>
      <div>Objects owned by the connected wallet</div>
      {data.data.map((object) => (
        <div key={object.data?.objectId}>
          <div style={{color:"black" }}>Object ID: {object.data?.objectId}</div>
        </div>
      ))}
    </div>
  );
}




  return (
    <main
  className={`flex h-screen flex-col items-center justify-between ${lyrics && ques ? 'p-40' : 'p-60'}`}
  style={{
    backgroundImage: (lyrics && ques) 
    ? "url(/profilebg.png)"
    : (currentWallet || (accounts?.current?.length > 0))
    ? "url(/afterlogin.png)"
    : "url(/beforelogin.png)",
    backgroundPosition: "center",
    position: "relative",
    zIndex: 0, 
  }}
>
  <div
    className="z-10 lg:max-w-7xl w-full justify-between font-mono text-sm lg:flex md:flex"
    style={{
      position: "absolute", // Makes the div overlay the background
      top: 30, // Adjust as needed
    }}
  >
    <p
      className="text-white text-2xl backdrop-blur-2xl dark:border-neutral-800 dark:from-inherit rounded-xl"
      style={{fontFamily: 'fantasy'}}
    >
      {/* Mystic Tarot */}
    </p>
    <div
    >
      <Navbar />
    </div>
      </div>

      <div className="lg:flex md:flex gap-10">
        <div>
          {!ques &&  (
            <button
              onClick={() => {
                setques(true);
              }}
              className={`bg-white rounded-full py-3 px-10 text-black uppercase ${currentWallet || (accounts?.current?.length > 0) ? 'mt-64' : 'mt-40'}`} style={{fontFamily: 'fantasy', backgroundColor:'#E8C6AA'}}
            >
              Get Yours Now
            </button>
          )}

{ques && (currentWallet || accounts?.current?.length > 0) && !lyrics && (
  <div className="mt-20 flex flex-col items-center">
                  <input
                    type="text"
                    placeholder="Write your question here"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="py-3 px-4 rounded-full w-full focus:outline-none text-black mt-48"
                    style={{ width: '100%', minWidth: '700px' }} 
                  />
                  
                  { !accounts.current[0] ? (
                    <button
                    // onClick={executeTransactionWithZKP}
                    onClick={()=>{handleDrawCardAndFetchreading();}}
                    className="bg-white rounded-full py-3 px-10 text-black mt-4 uppercase" style={{fontFamily: 'fantasy', backgroundColor:'#E8C6AA'}}
                  >
                    Get my reading
                  </button>
                  ):(
                  <button
                    // onClick={executeTransactionWithZKP}
                    onClick={()=>{sendTransaction(accounts.current[0]);}}
                    className="bg-white rounded-full py-3 px-10 text-black mt-4 uppercase" style={{fontFamily: 'fantasy', backgroundColor:'#E8C6AA'}}
                  >
                    Get my reading
                  </button>
                  )}
                </div>
)}

          {ques && (currentWallet || accounts?.current?.length > 0) && lyrics && (
            
            <div
              className="px-10 py-10 rounded-2xl max-w-xl"
              style={{
                boxShadow: "inset -10px -10px 60px 0 rgba(255, 255, 255, 0.4)",
                backgroundColor: "rgba(255, 255, 255, 0.7)"
              }}
            >
              <div>
                  <div>
                    <div className="flex gap-4 pb-8">
                      <button
                        onClick={() => {
                          setques(true);
                          setDrawnCard(null);
                          setLyrics("");
                        }}
                        className="rounded-full py-2 px-8 text-black font-semibold"
                        style={{backgroundColor: "#E8C6AA"}}
                      >
                        Start Again
                      </button>

                        { !accounts.current[0] ? (
                          <button
                        onClick={mintreading}
                        className="rounded-full py-2 px-6 text-black font-semibold"
                        style={{backgroundColor: "#E8C6AA"}}
                      >
                        Mint reading
                      </button>
                      ):(
                        <button
                        onClick={()=>{mintusingzk(accounts.current[0])}}
                        className="bg-yellow-100 rounded-full py-2 px-6 text-black font-semibold"
                        style={{backgroundColor: "#E8C6AA"}}
                      >
                        Mint reading
                      </button>
                      )}
                    </div>
                    <h2 className="font-bold mb-2 text-black">
                      Your Tarot Reading:
                    </h2>
                    <p className="text-black">{lyrics}</p>
                  </div>
              </div>
            </div>
          )}
        </div>

        {drawnCard && lyrics && (
          <div>
            <h2 className="mb-4 ml-20 text-white">{drawnCard}</h2>
            {position === "upright" ? (
              <img
                src={`${"https://nftstorage.link/ipfs"}/${
                  cardimage.split("ipfs://")[1].replace("jpg", "png")
                }`}
                width="350"
                height="350"
              />
            ) : (
              <img
                src={`${"https://nftstorage.link/ipfs"}/${
                  cardimage.split("ipfs://")[1].replace("jpg", "png")
                }`}
                width="350"
                height="350"
                style={{ transform: "rotate(180deg)" }}
              />
            )}
          </div>
        )}
      </div>

      {ques && (!currentWallet && !(accounts.current.length > 0))&& (
        <div
          style={{ backgroundColor: "rgba(255, 255, 255, 0.7)" }}
          className="flex overflow-y-auto overflow-x-hidden fixed inset-0 z-50 justify-center items-center w-full max-h-full"
          id="popupmodal"
        >
          <div className="relative p-4 lg:w-1/3 w-full max-w-2xl max-h-full">
            <div className="relative rounded-3xl shadow bg-black text-white">
              <div className="flex items-center justify-end p-4 md:p-5 rounded-t dark:border-gray-600">
                <button
                  onClick={() => setques(false)}
                  type="button"
                  className="text-white bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center dark:hover:bg-gray-600 dark:hover:text-white"
                >
                  <svg
                    className="w-3 h-3"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 14 14"
                  >
                    <path
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
                    />
                  </svg>
                  <span className="sr-only">Close modal</span>
                </button>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-2xl text-center font-bold" style={{color:'#FFB000'}}>
                Please connect your Sui Wallet
                </p>
              </div>
              <div className="flex items-center p-4 rounded-b pb-20 pt-10 justify-center">
                <div
                  className="mx-auto border pl-8 pr-10 py-2 rounded-full"
                >
                  <Navbar />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {mintdone && (
        <div
          style={{ backgroundColor: "rgba(255, 255, 255, 0.7)" }}
          className="flex overflow-y-auto overflow-x-hidden fixed inset-0 z-50 justify-center items-center w-full max-h-full"
          id="popupmodal"
        >
          <div className="relative p-4 lg:w-1/3 w-full max-w-2xl max-h-full">
            <div className="relative rounded-3xl shadow bg-black text-white">
              <div className="flex items-center justify-end p-4 md:p-5 rounded-t dark:border-gray-600">
                <button
                  onClick={() => setmintdone(false)}
                  type="button"
                  className="text-white bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center dark:hover:bg-gray-600 dark:hover:text-white"
                >
                  <svg
                    className="w-3 h-3"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 14 14"
                  >
                    <path
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
                    />
                  </svg>
                  <span className="sr-only">Close modal</span>
                </button>
              </div>

              {/* <Image src={emoji} alt="info" className="mx-auto"/> */}

              <div className="p-4 space-y-4">
                <p className="text-3xl text-center font-bold text-green-500">
                  Successfully Minted!!
                </p>
                <p className="text-sm text-center pt-4">
                  Go to your profile to view your minted NFTs
                </p>
              </div>
              <div className="flex items-center p-4 rounded-b pb-20">
                <Link href="/profile"
                  type="button"
                  className="w-1/2 mx-auto text-black font-bold focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg text-md px-5 py-2.5 text-center"
                  style={{backgroundColor:'#E8C6AA'}}
                >
                  My Profile
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div
          style={{ backgroundColor: "rgba(255, 255, 255, 0.7)" }}
          className="flex overflow-y-auto overflow-x-hidden fixed inset-0 z-50 justify-center items-center w-full max-h-full"
          id="popupmodal"
        >
          <div className="relative p-4 lg:w-1/5 w-full max-w-2xl max-h-full">
            <div className="relative rounded-lg shadow">
              <div className="flex justify-center gap-4">
                <img
                  className="w-50 h-50"
                  src="/loader.gif"
                  alt="Loading icon"
                />
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
