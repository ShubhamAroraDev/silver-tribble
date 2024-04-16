import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Presale } from "../target/types/presale";
import { assert } from "chai";
import * as spl from "@solana/spl-token";
import {
  createMint,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const test = async () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Presale as Program<Presale>;

  const paymentWallet = anchor.web3.Keypair.generate();
  const tempPaymentWallet = anchor.web3.Keypair.generate();
  const admin = anchor.web3.Keypair.generate();
  const tempAdmin = anchor.web3.Keypair.generate();
  const [presalePDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("presale_account")],
    program.programId
  );
  const tempOwner = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();
  const [userPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("user_account"), user.publicKey.toBytes()],
    program.programId
  );

  const user2 = anchor.web3.Keypair.generate();
  const [userPDA2] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("user_account"), user2.publicKey.toBytes()],
    program.programId
  );

  const tokenProgram = TOKEN_PROGRAM_ID;

  const tempWallet = anchor.web3.Keypair.generate();

  let paymentWalletUSDT;
  let userATA;
  let user2ATA;
  let usdTToken;
  let saleToken;
  let ownerSaleTokenATA;
  let presaleSaleTokenATA;
  let userSaleTokenATA;
  let user2SaleTokenATA;

  const chainlinkProgram = new anchor.web3.PublicKey(
    "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
  );
  const chainlinkFeed = new anchor.web3.PublicKey(
    "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR"
  );

  const { SystemProgram } = anchor.web3;
  let currentTime = 0;
  let rounds = [
    [
      new anchor.BN(100),
      new anchor.BN(200),
      new anchor.BN(300),
      new anchor.BN(400),
    ],
    [
      new anchor.BN(1_000_000_000),
      new anchor.BN(2_000_000_000),
      new anchor.BN(3_000_000_000),
      new anchor.BN(4_000_000_000),
    ],
  ];

  const createAccountAndFund = async (user, mintAddress, fundAmount) => {
    const tokenAccount = await spl.createAccount(
      provider.connection,
      tempWallet,
      mintAddress,
      user.publicKey,
      anchor.web3.Keypair.generate(),
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID
    );
    if (fundAmount > 0) {
      await spl.mintTo(
        provider.connection,
        tempWallet,
        mintAddress,
        tokenAccount,
        tempWallet,
        fundAmount,
        [],
        { commitment: "confirmed" },
        TOKEN_PROGRAM_ID
      );
    }

    return tokenAccount;
  };

  before(async () => {
    let slot = await provider.connection.getSlot();
    currentTime = await provider.connection.getBlockTime(slot);
    let roundEndTimes = [
      new anchor.BN(currentTime + 50),
      new anchor.BN(currentTime + 80),
      new anchor.BN(currentTime + 500),
      new anchor.BN(currentTime + 560),
    ];
    rounds.push(roundEndTimes);

    let token_airdrop = await provider.connection.requestAirdrop(
      user.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );

    let token_airdrop2 = await provider.connection.requestAirdrop(
      user2.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );

    let token_airdrop3 = await provider.connection.requestAirdrop(
      tempWallet.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );

    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: token_airdrop,
    });

    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: token_airdrop2,
    });

    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: token_airdrop3,
    });

    usdTToken = await createMint(
      provider.connection,
      tempWallet,
      tempWallet.publicKey,
      tempWallet.publicKey,
      6,
      anchor.web3.Keypair.generate(),
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID
    );

    paymentWalletUSDT = await createAccountAndFund(paymentWallet, usdTToken, 0);

    userATA = await createAccountAndFund(user, usdTToken, 1000000000000);
    user2ATA = await createAccountAndFund(user2, usdTToken, 1000000000000);

    saleToken = await createMint(
      provider.connection,
      tempWallet,
      tempWallet.publicKey,
      tempWallet.publicKey,
      6,
      anchor.web3.Keypair.generate(),
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID
    );

    ownerSaleTokenATA = await createAccountAndFund(
      provider.wallet,
      saleToken,
      1000000000000000
    );

    [presaleSaleTokenATA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        presalePDA.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        saleToken.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    [userSaleTokenATA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        user.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        saleToken.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    [user2SaleTokenATA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        user2.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        saleToken.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  });

  describe("Init", () => {
    it("Should not initialize with wrong start time", async () => {
      let isError = false;
      try {
        await program.methods
          .init(
            paymentWallet.publicKey,
            new anchor.BN(0),
            rounds,
            new anchor.BN(80),
            admin.publicKey,
            usdTToken,
            paymentWalletUSDT
          )
          .accounts({
            presaleAccount: presalePDA,
            owner: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(err.error.errorCode.number == 6000, "Start time check failed");
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not initialize presale wrong PDA", async () => {
      const newPDAAddress = anchor.web3.Keypair.generate();
      let isError = false;

      try {
        await program.methods
          .init(
            paymentWallet.publicKey,
            new anchor.BN(currentTime + 60),
            rounds,
            new anchor.BN(80),
            admin.publicKey,
            usdTToken,
            paymentWalletUSDT
          )
          .accounts({
            presaleAccount: newPDAAddress.publicKey,
            owner: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2006,
          "Seed constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should initialize presale with correct params", async () => {
      await program.methods
        .init(
          paymentWallet.publicKey,
          new anchor.BN(currentTime + 20),
          rounds,
          new anchor.BN(80),
          admin.publicKey,
          usdTToken,
          paymentWalletUSDT
        )
        .accounts({
          presaleAccount: presalePDA,
          owner: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const presaleAccount = await program.account.presaleAccount.fetch(
        presalePDA
      );

      assert(
        presaleAccount.owner.toString() ===
          provider.wallet.publicKey.toBase58(),
        "Presale Owner init failed"
      );

      assert(
        presaleAccount.paymentWallet.toString() ===
          paymentWallet.publicKey.toBase58(),
        "Presale payment wallet init failed"
      );

      assert(
        presaleAccount.startTime.toString() ===
          new anchor.BN(currentTime + 20).toString(),
        "Presale start init failed"
      );

      assert(presaleAccount.isPaused == false, "Pause status init failed");
      assert(
        presaleAccount.currentRound.toString() == "0",
        "Current step init failed"
      );
    });
  });

  describe("Ownership", () => {
    it("Should not allow non-owner to change owner", async () => {
      const newOwnerAddress = anchor.web3.Keypair.generate();
      let isError = false;

      try {
        await program.methods
          .changeOwner(newOwnerAddress.publicKey)
          .accounts({
            presaleAccount: presalePDA,
            owner: newOwnerAddress.publicKey,
          })
          .signers([newOwnerAddress])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2001,
          "Has one constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not allow non-owner to change payment wallet", async () => {
      const newOwnerAddress = anchor.web3.Keypair.generate();
      let isError = false;

      try {
        await program.methods
          .changePaymentWallet(newOwnerAddress.publicKey)
          .accounts({
            presaleAccount: presalePDA,
            owner: newOwnerAddress.publicKey,
          })
          .signers([newOwnerAddress])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2001,
          "Has one constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not allow non-owner to change payment wallet USDT", async () => {
      const newOwnerAddress = anchor.web3.Keypair.generate();
      let isError = false;

      try {
        await program.methods
          .changePaymentWalletUsdt(newOwnerAddress.publicKey)
          .accounts({
            presaleAccount: presalePDA,
            owner: newOwnerAddress.publicKey,
          })
          .signers([newOwnerAddress])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2001,
          "Has one constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not allow non-owner to change start time", async () => {
      const newOwnerAddress = anchor.web3.Keypair.generate();
      let isError = false;

      try {
        await program.methods
          .changeStartTime(new anchor.BN(currentTime + 30))
          .accounts({
            presaleAccount: presalePDA,
            owner: newOwnerAddress.publicKey,
          })
          .signers([newOwnerAddress])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2001,
          "Has one constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not allow non-owner to change rounds", async () => {
      const newOwnerAddress = anchor.web3.Keypair.generate();
      let isError = false;

      let tempRounds = rounds;
      tempRounds[0][2] = new anchor.BN(1000);

      try {
        await program.methods
          .changeRounds(tempRounds)
          .accounts({
            presaleAccount: presalePDA,
            owner: newOwnerAddress.publicKey,
          })
          .signers([newOwnerAddress])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2001,
          "Has one constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not allow non-owner to pause presale", async () => {
      const newOwnerAddress = anchor.web3.Keypair.generate();
      let isError = false;

      try {
        await program.methods
          .pausePresale()
          .accounts({
            presaleAccount: presalePDA,
            owner: newOwnerAddress.publicKey,
          })
          .signers([newOwnerAddress])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2001,
          "Has one constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not allow non-owner to change max tokens to buy", async () => {
      const newOwnerAddress = anchor.web3.Keypair.generate();
      let isError = false;

      try {
        await program.methods
          .changeMaxTokensToBuy(new anchor.BN(90))
          .accounts({
            presaleAccount: presalePDA,
            owner: newOwnerAddress.publicKey,
          })
          .signers([newOwnerAddress])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2001,
          "Has one constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not allow non-owner to change admin", async () => {
      const newOwnerAddress = anchor.web3.Keypair.generate();
      let isError = false;

      try {
        await program.methods
          .changeAdmin(tempAdmin.publicKey)
          .accounts({
            presaleAccount: presalePDA,
            owner: newOwnerAddress.publicKey,
          })
          .signers([newOwnerAddress])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2001,
          "Has one constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should allow owner to change owner", async () => {
      await program.methods
        .changeOwner(tempOwner.publicKey)
        .accounts({
          presaleAccount: presalePDA,
          owner: provider.wallet.publicKey,
        })
        .rpc();

      let presaleAccount = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccount.owner.toString() === tempOwner.publicKey.toBase58(),
        "Owner update failed"
      );
    });

    it("Should not allow prev owner to change anything", async () => {
      let isError = false;

      try {
        await program.methods
          .changeStartTime(new anchor.BN(currentTime + 30))
          .accounts({
            presaleAccount: presalePDA,
            owner: provider.wallet.publicKey,
          })
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2001,
          "Has one constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should allow owner to change payment wallet", async () => {
      await program.methods
        .changePaymentWallet(tempPaymentWallet.publicKey)
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      let presaleAccount = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccount.paymentWallet.toString() ===
          tempPaymentWallet.publicKey.toBase58(),
        "Payment wallet update failed"
      );
    });

    it("Should allow owner to change payment wallet USDT", async () => {
      await program.methods
        .changePaymentWalletUsdt(tempPaymentWallet.publicKey)
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      let presaleAccount = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccount.paymentWallet.toString() ===
          tempPaymentWallet.publicKey.toBase58(),
        "Payment wallet update failed"
      );
    });

    it("Should allow owner to change max tokens to buy", async () => {
      await program.methods
        .changeMaxTokensToBuy(new anchor.BN(90))
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      let presaleAccount = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccount.maxTokensToBuy.toString() === "90",
        "Max tokens to buy update failed"
      );
    });

    it("Should allow owner to change max tokens to buy", async () => {
      await program.methods
        .changeAdmin(tempAdmin.publicKey)
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      let presaleAccount = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccount.admin.toString() === tempAdmin.publicKey.toBase58(),
        "Max tokens to buy update failed"
      );
    });

    it("Should allow owner to change rounds", async () => {
      let tempRounds = rounds;
      tempRounds[0][2] = new anchor.BN(1000);
      await program.methods
        .changeRounds(tempRounds)
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      let presaleAccount = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccount.rounds[0][2].toString() === "1000",
        "Rounds update failed"
      );
    });

    it("Should allow owner to pause presale", async () => {
      await program.methods
        .pausePresale()
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      let presaleAccount = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(presaleAccount.isPaused === true, "Pause update failed");
    });

    it("Should not allow non-owner to unpause presale", async () => {
      const newOwnerAddress = anchor.web3.Keypair.generate();
      let isError = false;

      try {
        await program.methods
          .unpausePresale()
          .accounts({
            presaleAccount: presalePDA,
            owner: newOwnerAddress.publicKey,
          })
          .signers([newOwnerAddress])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2001,
          "Has one constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should allow owner to change start time", async () => {
      await program.methods
        .changeStartTime(new anchor.BN(currentTime + 120))
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      let presaleAccount = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccount.startTime.toString() ===
          new anchor.BN(currentTime + 120).toString(),
        "Start time update failed"
      );
    });

    it("Should not allow non-owner to change round time", async () => {
      const newOwnerAddress = anchor.web3.Keypair.generate();
      let isError = false;

      try {
        await program.methods
          .changeRoundTime(true, new anchor.BN(30))
          .accounts({
            presaleAccount: presalePDA,
            owner: newOwnerAddress.publicKey,
          })
          .signers([newOwnerAddress])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2001,
          "Has one constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should allow owner to change round time", async () => {
      await program.methods
        .changeRoundTime(true, new anchor.BN(30))
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      let presaleAccount = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccount.perRoundTime.toString() === new anchor.BN(30).toString(),
        "Per round time update failed"
      );
    });
  });

  describe("Reset", async () => {
    it("Should reset", async () => {
      await program.methods
        .changeStartTime(new anchor.BN(currentTime + 20))
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      await program.methods
        .changePaymentWallet(paymentWallet.publicKey)
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      await program.methods
        .changePaymentWalletUsdt(paymentWalletUSDT)
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      rounds[0][2] = new anchor.BN(300);

      await program.methods
        .changeRounds(rounds)
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      await program.methods
        .unpausePresale()
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      await program.methods
        .changeMaxTokensToBuy(new anchor.BN(80))
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      await program.methods
        .changeAdmin(admin.publicKey)
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      await program.methods
        .changeOwner(provider.wallet.publicKey)
        .accounts({
          presaleAccount: presalePDA,
          owner: tempOwner.publicKey,
        })
        .signers([tempOwner])
        .rpc();

      let presaleAccount = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccount.rounds[0][2].toString() == "300",
        "Round reset failed"
      );
      assert(presaleAccount.isPaused == false, "Pause reset failed");
      assert(
        presaleAccount.maxTokensToBuy.toString() == "80",
        "Max tokens to buy reset failed"
      );
    });
  });

  describe("Buy", async () => {
    it("Should not allow to query price for more than max tokens to buy", async () => {
      let isError = false;
      try {
        await program.methods
          .calculatePrice(new anchor.BN(100))
          .accounts({
            presaleAccount: presalePDA,
          })
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 6002,
          "Max tokens to buy check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should return correct price for round 1", async () => {
      const data = await program.methods
        .calculatePrice(new anchor.BN(2))
        .accounts({
          presaleAccount: presalePDA,
        })
        .view();
      assert(
        data.priceInUsd.toString() == "2000000000",
        "Price calculation failed"
      );

      const data_usdt = await program.methods
        .usdtBuyHelper(new anchor.BN(2))
        .accounts({
          presaleAccount: presalePDA,
        })
        .view();

      assert(
        data_usdt.toString() == "2000000",
        "USDT Price calculation failed"
      );
    });

    it("Should not let users buy before start time", async () => {
      let isError = false;
      try {
        await program.methods
          .buyWithSol(new anchor.BN(1))
          .accounts({
            presaleAccount: presalePDA,
            user: user.publicKey,
            userAccount: userPDA,
            paymentWallet: paymentWallet.publicKey,
            systemProgram: SystemProgram.programId,
            chainlinkFeed: chainlinkFeed,
            chainlinkProgram: chainlinkProgram,
          })
          .signers([user])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 6005,
          "Presale start time check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should let users buy after start", async () => {
      await new Promise((resolve) => setTimeout(resolve, 30000));
      await program.methods
        .buyWithUsdt(new anchor.BN(25))
        .accounts({
          user: user.publicKey,
          userAccount: userPDA,
          userUsdtAta: userATA,
          presaleAccount: presalePDA,
          paymentWalletUsdt: paymentWalletUSDT,
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgram,
        })
        .signers([user])
        .rpc();
      const presaleAccountData = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccountData.tokensSold.toString() == "25",
        "Tokens sold update failed"
      );
      const userAccountData = await program.account.userAccount.fetch(userPDA);
      assert(
        userAccountData.purchasedAmount.toString() == "25",
        "User purchased amount update failed"
      );
    });

    it("Should not let users buy zero amount", async () => {
      let isError = false;
      try {
        await program.methods
          .buyWithSol(new anchor.BN(0))
          .accounts({
            presaleAccount: presalePDA,
            user: user.publicKey,
            userAccount: userPDA,
            paymentWallet: paymentWallet.publicKey,
            systemProgram: SystemProgram.programId,
            chainlinkFeed: chainlinkFeed,
            chainlinkProgram: chainlinkProgram,
          })
          .signers([user])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(err.error.errorCode.number == 6004, "Zero amount check failed");
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not let users to buy if presale is paused", async () => {
      let isError = false;
      await program.methods
        .pausePresale()
        .accounts({
          presaleAccount: presalePDA,
          owner: provider.wallet.publicKey,
        })
        .rpc();
      try {
        await program.methods
          .buyWithSol(new anchor.BN(10))
          .accounts({
            presaleAccount: presalePDA,
            user: user.publicKey,
            userAccount: userPDA,
            paymentWallet: paymentWallet.publicKey,
            systemProgram: SystemProgram.programId,
            chainlinkFeed: chainlinkFeed,
            chainlinkProgram: chainlinkProgram,
          })
          .signers([user])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 6007,
          "Presale pause check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not let users to buy more than max tokens in single transaction", async () => {
      let isError = false;
      await program.methods
        .unpausePresale()
        .accounts({
          presaleAccount: presalePDA,
          owner: provider.wallet.publicKey,
        })
        .rpc();
      try {
        await program.methods
          .buyWithSol(new anchor.BN(100))
          .accounts({
            presaleAccount: presalePDA,
            user: user.publicKey,
            userAccount: userPDA,
            paymentWallet: paymentWallet.publicKey,
            systemProgram: SystemProgram.programId,
            chainlinkFeed: chainlinkFeed,
            chainlinkProgram: chainlinkProgram,
          })
          .signers([user])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(err.error.errorCode.number == 6002, "Max tokens check failed");
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not let owner change start time once presale starts", async () => {
      let isError = false;
      try {
        await program.methods
          .changeStartTime(new anchor.BN(100000000000000))
          .accounts({
            presaleAccount: presalePDA,
            owner: provider.wallet.publicKey,
          })
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 6001,
          "Presale already started check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should let user to buy upto max tokens to buy", async () => {
      await program.methods
        .buyWithUsdt(new anchor.BN(50))
        .accounts({
          user: user2.publicKey,
          userAccount: userPDA2,
          userUsdtAta: user2ATA,
          presaleAccount: presalePDA,
          paymentWalletUsdt: paymentWalletUSDT,
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgram,
        })
        .signers([user2])
        .rpc();
      const presaleAccountData = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccountData.tokensSold.toString() == "75",
        "Tokens sold update failed"
      );
      const userAccountData = await program.account.userAccount.fetch(userPDA2);
      assert(
        userAccountData.purchasedAmount.toString() == "50",
        "User purchased amount update failed"
      );
    });

    it("Should calculate tokens price accordingly on sellout", async () => {
      const resp = await program.methods
        .calculatePrice(new anchor.BN(50))
        .accounts({
          presaleAccount: presalePDA,
        })
        .view();
      assert(
        resp.priceInUsd.toString() == "75000000000",
        "Price on sellout check failed"
      );
      assert(resp.newRound.toString() == "1", "New round suggest failed");
    });

    it("Should calculate tokens price accordingly on time shift", async () => {
      await new Promise((resolve) => setTimeout(resolve, 42000));
      const data = await program.methods
        .calculatePrice(new anchor.BN(25))
        .accounts({
          presaleAccount: presalePDA,
        })
        .view();
      assert(data.newRound.toString() == "2", "Round calculation failed");
      assert(
        data.priceInUsd.toString() == "75000000000",
        "Price calculation failed"
      );
    });

    it("Should allow users to buy tokens and switch rounds based on time", async () => {
      let slot = await provider.connection.getSlot();
      currentTime = await provider.connection.getBlockTime(slot);
      await program.methods
        .buyWithUsdt(new anchor.BN(25))
        .accounts({
          user: user.publicKey,
          userAccount: userPDA,
          userUsdtAta: userATA,
          presaleAccount: presalePDA,
          paymentWalletUsdt: paymentWalletUSDT,
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgram,
        })
        .signers([user])
        .rpc();
      const presaleAccountData = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccountData.currentRound.toString() == "2",
        "Round update failed"
      );
      assert(
        presaleAccountData.tokensSold.toString() == "100",
        "Tokens sold update failed"
      );
      assert(
        presaleAccountData.currentTracker.toString() == "225",
        "Current tracker update failed"
      );
    });

    it("Should allow users to buy tokens and switch rounds based sellout", async () => {
      let slot = await provider.connection.getSlot();
      currentTime = await provider.connection.getBlockTime(slot);
      let presaleAccountData = await program.account.presaleAccount.fetch(
        presalePDA
      );
      await program.methods
        .buyWithUsdt(new anchor.BN(50))
        .accounts({
          user: user.publicKey,
          userAccount: userPDA,
          userUsdtAta: userATA,
          presaleAccount: presalePDA,
          paymentWalletUsdt: paymentWalletUSDT,
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgram,
        })
        .signers([user])
        .rpc();
      await program.methods
        .buyWithUsdt(new anchor.BN(50))
        .accounts({
          user: user.publicKey,
          userAccount: userPDA,
          userUsdtAta: userATA,
          presaleAccount: presalePDA,
          paymentWalletUsdt: paymentWalletUSDT,
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgram,
        })
        .signers([user])
        .rpc();
      presaleAccountData = await program.account.presaleAccount.fetch(
        presalePDA
      );

      assert(
        presaleAccountData.currentRound.toString() == "3",
        "Round update failed"
      );
      assert(
        presaleAccountData.tokensSold.toString() == "200",
        "Tokens sold update failed"
      );
      assert(
        presaleAccountData.currentTracker.toString() == "325",
        "Current tracker update failed"
      );
    });

    it("Should allow to buy remaining tokens and finish presale", async () => {
      await program.methods
        .buyWithUsdt(new anchor.BN(75))
        .accounts({
          user: user.publicKey,
          userAccount: userPDA,
          userUsdtAta: userATA,
          presaleAccount: presalePDA,
          paymentWalletUsdt: paymentWalletUSDT,
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgram,
        })
        .signers([user])
        .rpc();
      const presaleAccountData = await program.account.presaleAccount.fetch(
        presalePDA
      );
      assert(
        presaleAccountData.tokensSold.toString() == "275",
        "Tokens sold update failed"
      );
      assert(
        presaleAccountData.currentTracker.toString() == "400",
        "Current tracker update failed"
      );
    });

    it("Should not let user to buy more tokens once presale ends", async () => {
      let isError = false;
      try {
        await program.methods
          .buyWithSol(new anchor.BN(1))
          .accounts({
            user: user.publicKey,
            userAccount: userPDA,
            paymentWallet: paymentWallet.publicKey,
            presaleAccount: presalePDA,
            systemProgram: SystemProgram.programId,
            chainlinkFeed: chainlinkFeed,
            chainlinkProgram: chainlinkProgram,
          })
          .signers([user])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(err.error.errorCode.number == 6003, "Presale end check failed");
        isError = true;
      }
      assert(isError, "Test case failed");
    });
  });

  describe("Claim", async () => {
    it("Should allow the admin to increment round", async () => {
      let presaleAccountData = await program.account.presaleAccount.fetch(
        presalePDA
      );
      await program.methods
        .incrementCurrentRound()
        .accounts({
          user: admin.publicKey,
          presaleAccount: presalePDA,
        })
        .signers([admin])
        .rpc();

      presaleAccountData = await program.account.presaleAccount.fetch(
        presalePDA
      );
    });

    it("Should not allow non-owner to start claim", async () => {
      const newOwnerAddress = anchor.web3.Keypair.generate();
      let isError = false;

      let token_airdrop = await provider.connection.requestAirdrop(
        newOwnerAddress.publicKey,
        10 * anchor.web3.LAMPORTS_PER_SOL
      );

      const latestBlockHash = await provider.connection.getLatestBlockhash();
      await provider.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: token_airdrop,
      });

      try {
        await program.methods
          .startClaim(new anchor.BN(currentTime + 600), new anchor.BN(275), 9)
          .accounts({
            owner: newOwnerAddress.publicKey,
            presaleAccount: presalePDA,
            ownerAta: ownerSaleTokenATA,
            presaleAta: presaleSaleTokenATA,
            saleToken: saleToken,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([newOwnerAddress])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 2001,
          "Has one constraint check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not allow owner to start claim with lesser tokens", async () => {
      let isError = false;

      try {
        await program.methods
          .startClaim(new anchor.BN(currentTime + 600), new anchor.BN(274), 9)
          .accounts({
            owner: provider.wallet.publicKey,
            presaleAccount: presalePDA,
            ownerAta: ownerSaleTokenATA,
            presaleAta: presaleSaleTokenATA,
            saleToken: saleToken,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(err.error.errorCode.number == 6010, "Tokens added check failed");
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not allow owner to start claim with past claim time", async () => {
      let isError = false;

      try {
        await program.methods
          .startClaim(new anchor.BN(1), new anchor.BN(275), 9)
          .accounts({
            owner: provider.wallet.publicKey,
            presaleAccount: presalePDA,
            ownerAta: ownerSaleTokenATA,
            presaleAta: presaleSaleTokenATA,
            saleToken: saleToken,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(err.error.errorCode.number == 6011, "Claim start check failed");
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should not allow owner to start claim with 0 decimals", async () => {
      let isError = false;

      try {
        await program.methods
          .startClaim(new anchor.BN(currentTime + 600), new anchor.BN(275), 0)
          .accounts({
            owner: provider.wallet.publicKey,
            presaleAccount: presalePDA,
            ownerAta: ownerSaleTokenATA,
            presaleAta: presaleSaleTokenATA,
            saleToken: saleToken,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 6012,
          "Zero decimals check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should allow the owner to start claim", async () => {
      let presaleAccountData = await program.account.presaleAccount.fetch(
        presalePDA
      );

      await program.methods
        .startClaim(
          new anchor.BN(presaleAccountData.rounds[2][3].add(new anchor.BN(30))),
          new anchor.BN(275),
          6
        )
        .accounts({
          owner: provider.wallet.publicKey,
          presaleAccount: presalePDA,
          ownerAta: ownerSaleTokenATA,
          presaleAta: presaleSaleTokenATA,
          saleToken: saleToken,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      presaleAccountData = await program.account.presaleAccount.fetch(
        presalePDA
      );

      assert(
        presaleAccountData.saleToken.toBase58() == saleToken,
        "Sale token update failed"
      );
      assert(
        presaleAccountData.tokensAdded.toString() == "275",
        "Tokens added update failed"
      );
      assert(
        presaleAccountData.saleTokenDecimals.toString() == "6",
        "Sale token decimals update failed"
      );
    });

    it("Should not allow users to claim before claim start", async () => {
      await program.methods
        .changeWhitelistClaimStatus(false)
        .accounts({
          presaleAccount: presalePDA,
          owner: provider.wallet.publicKey,
        })
        .rpc();

      let isError = false;

      try {
        await program.methods
          .claim()
          .accounts({
            user: user.publicKey,
            presaleAccount: presalePDA,
            userAccount: userPDA,
            presaleAta: presaleSaleTokenATA,
            userAta: userSaleTokenATA,
            saleToken: saleToken,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(err.error.errorCode.number == 6013, "Claim start check failed");
        isError = true;
      }
      assert(isError, "Test case failed");
      await program.methods
        .changeWhitelistClaimStatus(true)
        .accounts({
          presaleAccount: presalePDA,
          owner: provider.wallet.publicKey,
        })
        .rpc();
    });

    it("Should not allow users to claim after claim start and whitelist claim is enabled", async () => {
      await new Promise((resolve) => setTimeout(resolve, 60000));
      let isError = false;

      try {
        await program.methods
          .claim()
          .accounts({
            user: user.publicKey,
            presaleAccount: presalePDA,
            userAccount: userPDA,
            presaleAta: presaleSaleTokenATA,
            userAta: userSaleTokenATA,
            saleToken: saleToken,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(
          err.error.errorCode.number == 6017,
          "Whitelist claim only check failed"
        );
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should let users claim when whitelisted", async () => {
      let slot = await provider.connection.getSlot();
      currentTime = await provider.connection.getBlockTime(slot);

      await program.methods
        .changeClaimWhitelistUsers([
          user.publicKey,
          user.publicKey,
          user.publicKey,
          user.publicKey,
          user.publicKey,
        ])
        .accounts({
          owner: provider.wallet.publicKey,
          presaleAccount: presalePDA,
        })
        .rpc();

      await program.methods
        .claim()
        .accounts({
          user: user.publicKey,
          presaleAccount: presalePDA,
          userAccount: userPDA,
          presaleAta: presaleSaleTokenATA,
          userAta: userSaleTokenATA,
          saleToken: saleToken,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const info = await provider.connection.getTokenAccountBalance(
        userSaleTokenATA
      );
      if (info.value.uiAmount == null) throw new Error("No balance found");
      assert(info.value.amount == "225000000", "Token claim failed");
    });

    it("Should not allow users to claim when paused", async () => {
      await program.methods
        .changeWhitelistClaimStatus(false)
        .accounts({
          owner: provider.wallet.publicKey,
          presaleAccount: presalePDA,
        })
        .rpc();

      await program.methods
        .pausePresale()
        .accounts({
          owner: provider.wallet.publicKey,
          presaleAccount: presalePDA,
        })
        .rpc();

      let isError = false;

      try {
        await program.methods
          .claim()
          .accounts({
            user: user2.publicKey,
            presaleAccount: presalePDA,
            userAccount: userPDA2,
            presaleAta: presaleSaleTokenATA,
            userAta: user2SaleTokenATA,
            saleToken: saleToken,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user2])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(err.error.errorCode.number == 6007, "Pause check failed");
        isError = true;
      }
      assert(isError, "Test case failed");
    });

    it("Should let user 2 claim", async () => {
      await program.methods
        .unpausePresale()
        .accounts({
          owner: provider.wallet.publicKey,
          presaleAccount: presalePDA,
        })
        .rpc();
      await program.methods
        .claim()
        .accounts({
          user: user2.publicKey,
          presaleAccount: presalePDA,
          userAccount: userPDA2,
          presaleAta: presaleSaleTokenATA,
          userAta: user2SaleTokenATA,
          saleToken: saleToken,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc();

      const info = await provider.connection.getTokenAccountBalance(
        user2SaleTokenATA
      );
      if (info.value.uiAmount == null) throw new Error("No balance found");
      assert(info.value.amount == "50000000", "Token claim failed");
    });

    it("Should not allow users to claim after successfull claim", async () => {
      let isError = false;

      try {
        await program.methods
          .claim()
          .accounts({
            user: user.publicKey,
            presaleAccount: presalePDA,
            userAccount: userPDA,
            presaleAta: presaleSaleTokenATA,
            userAta: userSaleTokenATA,
            saleToken: saleToken,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user])
          .rpc();
      } catch (error) {
        let err = error as anchor.AnchorError;
        assert(err.error.errorCode.number == 3012, "Claim start check failed");
        isError = true;
      }
      assert(isError, "Test case failed");
    });
  });
};

test();
