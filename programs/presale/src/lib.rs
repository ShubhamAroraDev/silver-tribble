use anchor_lang::prelude::*;
use anchor_lang::solana_program::native_token::LAMPORTS_PER_SOL;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer as SplTransferInstruction};
use chainlink_solana as chainlink;
use std::str::FromStr;

declare_id!("938Ddfngq8N4V2be6Afxkiy2hwMKpGj1vigNHC1p9Ws4");

pub const CHAINLINK_PROGRAM: &str = "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny";
pub const CHAINLINK_FEED: &str = "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR"; // (Devnet) - CH31Xns5z3M1cTAbKW34jcxPPciazARpijcHj9rxtemt(Mainnet)

#[program]
mod presale {

    use super::*;

    pub fn init(
        ctx: Context<PresaleInit>,
        payment_wallet: Pubkey,
        start_time: u128,
        rounds: Vec<Vec<u128>>,
        max_tokens_to_buy: u128,
        admin: Pubkey,
        usd_token: Pubkey,
        payment_wallet_usdt: Pubkey,
    ) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;
        let current_time = Clock::get()?.unix_timestamp.try_into().unwrap();

        require!(start_time > current_time, PresaleErrors::InvalidStartTime);

        presale_account.owner = ctx.accounts.owner.key();
        presale_account.payment_wallet = payment_wallet;
        presale_account.start_time = start_time;
        presale_account.rounds = rounds;
        presale_account.max_tokens_to_buy = max_tokens_to_buy;
        presale_account.admin = admin;
        presale_account.usdt_token = usd_token;
        presale_account.payment_wallet_usdt = payment_wallet_usdt;

        Ok(())
    }

    pub fn change_owner(ctx: Context<UpdatePresaleState>, new_owner: Pubkey) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;

        msg!(
            "Owner changing from {} to {}",
            presale_account.owner,
            new_owner
        );
        presale_account.owner = new_owner;

        Ok(())
    }

    pub fn change_payment_wallet(
        ctx: Context<UpdatePresaleState>,
        new_payment_wallet: Pubkey,
    ) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;

        msg!(
            "Payment wallet changing from {} to {}",
            presale_account.payment_wallet,
            new_payment_wallet
        );

        presale_account.payment_wallet = new_payment_wallet;

        Ok(())
    }

    pub fn change_payment_wallet_usdt(
        ctx: Context<UpdatePresaleState>,
        new_payment_wallet_usdt: Pubkey,
    ) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;

        msg!(
            "Payment wallet USDT changing from {} to {}",
            presale_account.payment_wallet_usdt,
            new_payment_wallet_usdt
        );

        presale_account.payment_wallet_usdt = new_payment_wallet_usdt;

        Ok(())
    }

    pub fn change_whitelist_claim_status(
        ctx: Context<UpdatePresaleState>,
        new_status: bool,
    ) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;

        msg!(
            "Whitelist claim only status changing from {} to {}",
            presale_account.whitelist_claim_only,
            new_status
        );

        presale_account.whitelist_claim_only = new_status;

        Ok(())
    }

    pub fn change_current_round_and_tracker(
        ctx: Context<UpdatePresaleState>,
        new_current_round: u128,
        new_current_tracker: u128,
    ) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;

        msg!(
            "Round changing from {} to {}",
            presale_account.current_round,
            new_current_round
        );

        msg!(
            "Tracker changing from {} to {}",
            presale_account.current_tracker,
            new_current_tracker
        );

        presale_account.current_round = new_current_round;
        presale_account.current_tracker = new_current_tracker;
        Ok(())
    }

    pub fn change_start_time(ctx: Context<UpdatePresaleState>, new_start_time: u128) -> Result<()> {
        let current_time = Clock::get()?.unix_timestamp.try_into().unwrap();

        require!(
            new_start_time > current_time,
            PresaleErrors::InvalidStartTime
        );
        let presale_account = &mut ctx.accounts.presale_account;

        require!(
            presale_account.start_time > current_time,
            PresaleErrors::PresaleAlreadyStarted
        );

        msg!(
            "Start time changing from {} to {}",
            presale_account.start_time,
            new_start_time
        );

        presale_account.start_time = new_start_time;

        Ok(())
    }

    pub fn change_rounds(
        ctx: Context<UpdatePresaleState>,
        new_rounds: Vec<Vec<u128>>,
    ) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;

        presale_account.rounds = new_rounds;

        Ok(())
    }

    pub fn pause_presale(ctx: Context<UpdatePresaleState>) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;
        presale_account.is_paused = true;
        msg!("Presale paused");
        Ok(())
    }

    pub fn unpause_presale(ctx: Context<UpdatePresaleState>) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;
        presale_account.is_paused = false;
        msg!("Presale unpaused");
        Ok(())
    }

    pub fn change_max_tokens_to_buy(
        ctx: Context<UpdatePresaleState>,
        new_max_tokens_to_buy: u128,
    ) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;
        msg!(
            "Max tokens to buy changing from {} to {}",
            presale_account.max_tokens_to_buy,
            new_max_tokens_to_buy
        );
        presale_account.max_tokens_to_buy = new_max_tokens_to_buy;
        Ok(())
    }

    pub fn change_admin(ctx: Context<UpdatePresaleState>, new_admin: Pubkey) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;
        msg!(
            "Admin changing from {} to {}",
            presale_account.admin,
            new_admin
        );
        presale_account.admin = new_admin;
        Ok(())
    }

    pub fn calculate_price(ctx: Context<CalculatePrice>, amount: u128) -> Result<CalculateReturn> {
        let presale_account = &mut ctx.accounts.presale_account;
        Ok(calculate_price_internal(&presale_account, amount)?)
    }

    pub fn usdt_buy_helper(ctx: Context<CalculatePrice>, amount: u128) -> Result<u128> {
        let presale_account = &mut ctx.accounts.presale_account;
        let price_in_usd = calculate_price_internal(presale_account, amount)?.price_in_usd;
        Ok(price_in_usd / 1000)
    }

    pub fn sol_buy_helper(ctx: Context<CalculatePriceSOL>, amount: u128) -> Result<u128> {
        let presale_account = &mut ctx.accounts.presale_account;
        let price_in_usd = calculate_price_internal(presale_account, amount)?.price_in_usd;
        let sol_usd = (chainlink::latest_round_data(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?
        .answer
            * 10) as u128;

        msg!("Sol price is USD {}", sol_usd);

        let price_in_sol = (price_in_usd * LAMPORTS_PER_SOL as u128) / sol_usd;
        Ok(price_in_sol)
    }

    pub fn change_round_time(
        ctx: Context<UpdatePresaleState>,
        new_dynamic_time_flag: bool,
        new_round_time: u128,
    ) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;

        msg!(
            "Dynamic time change updating from {} to {}",
            presale_account.dynamic_time_change,
            new_dynamic_time_flag
        );
        msg!(
            "Per round time updating from {} to {}",
            presale_account.per_round_time,
            new_round_time
        );

        presale_account.dynamic_time_change = new_dynamic_time_flag;
        presale_account.per_round_time = new_round_time;

        Ok(())
    }

    pub fn buy_with_sol(ctx: Context<BuyWithSol>, amount: u128) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;
        let user_account = &mut ctx.accounts.user_account;
        let current_time: u128 = Clock::get()?.unix_timestamp.try_into().unwrap();

        require!(
            current_time > presale_account.start_time,
            PresaleErrors::PresaleNotStarted
        );
        require!(amount > 0, PresaleErrors::InvalidBuyAmount);
        require!(!presale_account.is_paused, PresaleErrors::PresalePaused);
        require!(
            presale_account.payment_wallet == ctx.accounts.payment_wallet.key(),
            PresaleErrors::IncorrectPaymentWallet
        );

        let price_and_round = calculate_price_internal(&presale_account, amount)?;
        require!(price_and_round.price_in_usd > 0, PresaleErrors::ZeroPrice);

        if price_and_round.new_round != presale_account.current_round {
            // Update all rounds from now with the new time
            if presale_account.dynamic_time_change {
                for i in 0..presale_account.rounds[2].len() - price_and_round.new_round as usize {
                    presale_account.rounds[2][(price_and_round.new_round + i as u128) as usize] =
                        current_time + ((i + 1) as u128 * (presale_account.per_round_time));
                }
            }

            // Update unsold tokens tracker
            let sale_amount = if presale_account.current_tracker == 0 {
                presale_account.tokens_sold + amount
            } else {
                presale_account.current_tracker + amount
            };

            for i in 0..(price_and_round.new_round - presale_account.current_round) {
                if i == 0 {
                    let value = if sale_amount
                        > presale_account.rounds[0][presale_account.current_round as usize]
                    {
                        0
                    } else {
                        presale_account.rounds[0][presale_account.current_round as usize]
                            - sale_amount
                    };
                    presale_account.unsold_tokens.push(value);
                } else {
                    let value1 = presale_account.rounds[0]
                        [(presale_account.current_round + i) as usize]
                        - presale_account.rounds[0]
                            [(presale_account.current_round + i - 1) as usize];

                    presale_account.unsold_tokens.push(value1);
                }
            }

            if current_time >= presale_account.rounds[2][presale_account.current_round as usize] {
                presale_account.current_tracker =
                    presale_account.rounds[0][(price_and_round.new_round - 1) as usize];
            }

            presale_account.current_round = price_and_round.new_round;
        }

        presale_account.usd_raised += price_and_round.price_in_usd;
        presale_account.tokens_sold += amount;

        if presale_account.current_tracker != 0 {
            presale_account.current_tracker += amount;
        }

        user_account.purchased_amount += amount;

        let sol_usd = (chainlink::latest_round_data(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?
        .answer
            * 10) as u128;

        msg!("Sol price is USD {}", sol_usd);

        let price_in_sol = (price_and_round.price_in_usd * LAMPORTS_PER_SOL as u128) / sol_usd;

        msg!("Final sol price is  {}", price_in_sol);

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.payment_wallet.to_account_info(),
            },
        );

        // let res = transfer(cpi_context, price_in_sol as u64)?;
        transfer(cpi_context, price_in_sol as u64)?;

        // if res.is_ok() {
        //     return Ok(());
        // } else {
        //     return err!(PresaleErrors::SolTransferFailed);
        // }
        Ok(())
    }

    pub fn buy_with_usdt(ctx: Context<BuyWithUSDT>, amount: u128) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;
        let user_account = &mut ctx.accounts.user_account;
        let current_time: u128 = Clock::get()?.unix_timestamp.try_into().unwrap();

        require!(
            current_time > presale_account.start_time,
            PresaleErrors::PresaleNotStarted
        );
        require!(amount > 0, PresaleErrors::InvalidBuyAmount);
        require!(!presale_account.is_paused, PresaleErrors::PresalePaused);
        require!(
            presale_account.payment_wallet_usdt == ctx.accounts.payment_wallet_usdt.key(),
            PresaleErrors::IncorrectPaymentWallet
        );

        let price_and_round = calculate_price_internal(&presale_account, amount)?;
        require!(price_and_round.price_in_usd > 0, PresaleErrors::ZeroPrice);

        if price_and_round.new_round != presale_account.current_round {
            // Update all rounds from now with the new time
            if presale_account.dynamic_time_change {
                for i in 0..presale_account.rounds[2].len() - price_and_round.new_round as usize {
                    presale_account.rounds[2][(price_and_round.new_round + i as u128) as usize] =
                        current_time + ((i + 1) as u128 * (presale_account.per_round_time));
                }
            }

            // Update unsold tokens tracker
            let sale_amount = if presale_account.current_tracker == 0 {
                presale_account.tokens_sold + amount
            } else {
                presale_account.current_tracker + amount
            };

            for i in 0..(price_and_round.new_round - presale_account.current_round) {
                if i == 0 {
                    let value = if sale_amount
                        > presale_account.rounds[0][presale_account.current_round as usize]
                    {
                        0
                    } else {
                        presale_account.rounds[0][presale_account.current_round as usize]
                            - sale_amount
                    };
                    presale_account.unsold_tokens.push(value);
                } else {
                    let value1 = presale_account.rounds[0]
                        [(presale_account.current_round + i) as usize]
                        - presale_account.rounds[0]
                            [(presale_account.current_round + i - 1) as usize];

                    presale_account.unsold_tokens.push(value1);
                }
            }

            if current_time >= presale_account.rounds[2][presale_account.current_round as usize] {
                presale_account.current_tracker =
                    presale_account.rounds[0][(price_and_round.new_round - 1) as usize];
            }

            presale_account.current_round = price_and_round.new_round;
        }

        presale_account.usd_raised += price_and_round.price_in_usd;
        presale_account.tokens_sold += amount;

        if presale_account.current_tracker != 0 {
            presale_account.current_tracker += amount;
        }

        user_account.purchased_amount += amount;

        let price_in_usdt = (price_and_round.price_in_usd) / (1000); // To accomodate for USDT's 6 decimals

        msg!("Price in USDT is {}", price_in_usdt);

        let cpi_accounts = SplTransferInstruction {
            from: ctx.accounts.user_usdt_ata.to_account_info(),
            to: ctx.accounts.payment_wallet_usdt.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();

        token::transfer(
            CpiContext::new(cpi_program, cpi_accounts),
            price_in_usdt as u64,
        )?;
        Ok(())
    }

    pub fn start_claim(
        ctx: Context<StartClaim>,
        claim_start: u128,
        tokens_to_add: u128,
        decimals: u8,
    ) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;
        let current_time = Clock::get()?.unix_timestamp.try_into().unwrap();

        require!(
            presale_account.current_round >= presale_account.rounds[0].len() as u128,
            PresaleErrors::PresaleNotEnded
        );

        require!(
            tokens_to_add >= presale_account.tokens_sold,
            PresaleErrors::IncorrectSaleTokenAdded
        );

        require!(
            claim_start > current_time,
            PresaleErrors::IncorrectClaimStartTime,
        );

        require!(decimals > 0, PresaleErrors::ZeroDecimals);

        presale_account.claim_start_time = claim_start;
        presale_account.sale_token = ctx.accounts.sale_token.key();
        presale_account.sale_token_decimals = decimals;
        presale_account.tokens_added = tokens_to_add;
        presale_account.whitelist_claim_only = true;

        let transfer_instruction = SplTransferInstruction {
            from: ctx.accounts.owner_ata.to_account_info(),
            to: ctx.accounts.presale_ata.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_instruction,
            ),
            (tokens_to_add * 10_u64.pow(decimals as u32) as u128) as u64,
        )?;

        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;
        let current_time: u128 = Clock::get()?.unix_timestamp.try_into().unwrap();
        let user_account = &mut ctx.accounts.user_account;

        if presale_account.whitelist_claim_only {
            require!(
                presale_account
                    .whitelisted_users
                    .contains(&ctx.accounts.user.key()),
                PresaleErrors::NotClaimWhitelisted
            );
        } else {
            require!(
                current_time > presale_account.claim_start_time
                    && presale_account.claim_start_time != 0,
                PresaleErrors::ClaimNotStarted,
            );
        }

        require!(
            user_account.purchased_amount > 0,
            PresaleErrors::NothingToClaim
        );

        require!(!presale_account.is_paused, PresaleErrors::PresalePaused);

        let transfer_instruction = SplTransferInstruction {
            from: ctx.accounts.presale_ata.to_account_info(),
            to: ctx.accounts.user_ata.to_account_info(),
            authority: presale_account.to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_instruction,
                &[&[b"presale_account", &[ctx.bumps.presale_account]]],
            ),
            user_account.purchased_amount as u64
                * (10_u64.pow(presale_account.sale_token_decimals as u32)) as u64,
        )?;

        presale_account.tokens_claimed += user_account.purchased_amount;

        msg!("Tokens claimed are {}", user_account.purchased_amount);

        Ok(())
    }

    pub fn increment_current_round(ctx: Context<IncrementCurrentRound>) -> Result<()> {
        let presale_account = &mut ctx.accounts.presale_account;
        let current_time: u128 = Clock::get()?.unix_timestamp.try_into().unwrap();

        require!(
            ctx.accounts.user.key() == presale_account.owner
                || ctx.accounts.user.key() == presale_account.admin,
            PresaleErrors::AccessRestricted,
        );

        let new_round = presale_account.current_round + 1;

        if presale_account.dynamic_time_change {
            for i in 0..presale_account.rounds[2].len() - (new_round) as usize {
                presale_account.rounds[2][((new_round) + i as u128) as usize] =
                    current_time + ((i + 1) as u128 * (presale_account.per_round_time));
            }
        }

        let sale_amount = if presale_account.current_tracker == 0 {
            presale_account.tokens_sold
        } else {
            presale_account.current_tracker
        };

        let value =
            if sale_amount > presale_account.rounds[0][presale_account.current_round as usize] {
                0
            } else {
                presale_account.rounds[0][presale_account.current_round as usize] - sale_amount
            };
        presale_account.unsold_tokens.push(value);

        presale_account.current_tracker = presale_account.rounds[0][(new_round - 1) as usize];

        presale_account.current_round += 1;

        Ok(())
    }

    pub fn change_claim_whitelist_users(
        ctx: Context<UpdatePresaleState>,
        new_wallets: Vec<Pubkey>,
    ) -> Result<()> {
        require!(new_wallets.len() == 5, PresaleErrors::InvalidLength);

        let presale_account = &mut ctx.accounts.presale_account;

        presale_account.whitelisted_users = new_wallets;

        Ok(())
    }
}

fn calculate_price_internal(
    presale_account: &PresaleAccount,
    amount: u128,
) -> Result<CalculateReturn> {
    let current_time: u128 = Clock::get()?.unix_timestamp.try_into().unwrap();

    require!(
        amount <= presale_account.max_tokens_to_buy,
        PresaleErrors::InvalidAmount
    );

    let mut price_in_usd =
        amount * presale_account.rounds[1][presale_account.current_round as usize];
    let mut new_round = presale_account.current_round;

    let sale_amount = if presale_account.current_tracker == 0 {
        presale_account.tokens_sold
    } else {
        presale_account.current_tracker
    };

    if current_time >= presale_account.rounds[2][presale_account.current_round as usize] {
        require!(
            presale_account.current_round != (presale_account.rounds[0].len() - 1) as u128,
            PresaleErrors::PresaleEnded
        );

        // Finding round based on time
        for i in presale_account.current_round + 1..presale_account.rounds[0].len() as u128 {
            if current_time < presale_account.rounds[2][i as usize] {
                new_round = i;
                break;
            }
        }
        require!(
            new_round != presale_account.current_round,
            PresaleErrors::PresaleEnded
        );

        require!(
            presale_account.rounds[0][(new_round - 1) as usize] + amount
                <= presale_account.rounds[0][(new_round) as usize],
            PresaleErrors::InvalidBuyAmount
        );

        price_in_usd = amount * presale_account.rounds[1][new_round as usize];
    } else if sale_amount + amount
        > presale_account.rounds[0][presale_account.current_round as usize]
    {
        require!(
            presale_account.current_round != (presale_account.rounds[0].len() - 1) as u128,
            PresaleErrors::PresaleEnded
        );

        let extra = (sale_amount + amount)
            - presale_account.rounds[0][presale_account.current_round as usize];

        price_in_usd = (extra
            * presale_account.rounds[1][(presale_account.current_round + 1) as usize])
            + (((amount) - extra)
                * presale_account.rounds[1][presale_account.current_round as usize]);

        new_round = presale_account.current_round + 1;
    }

    let calculate_return = CalculateReturn::new(price_in_usd, new_round);
    Ok(calculate_return)
}

#[derive(Accounts)]
pub struct PresaleInit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(init, payer = owner, space = 8 + PresaleAccount::INIT_SPACE, seeds = [(b"presale_account")], bump)]
    pub presale_account: Account<'info, PresaleAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePresaleState<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner, seeds = [b"presale_account"], bump)]
    pub presale_account: Account<'info, PresaleAccount>,
}

#[derive(Accounts)]
pub struct CalculatePrice<'info> {
    pub presale_account: Account<'info, PresaleAccount>,
}

#[derive(Accounts)]
pub struct CalculatePriceSOL<'info> {
    #[account(address = Pubkey::from_str(CHAINLINK_PROGRAM).unwrap())]
    /// CHECK: This is safe as we are using chainlink program
    pub chainlink_program: UncheckedAccount<'info>,
    #[account(address = Pubkey::from_str(CHAINLINK_FEED).unwrap())]
    /// CHECK: This is safe as we are using chainlink feed
    pub chainlink_feed: UncheckedAccount<'info>,
    pub presale_account: Account<'info, PresaleAccount>,
}

#[derive(Accounts)]
pub struct BuyWithSol<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"presale_account"], bump)]
    pub presale_account: Account<'info, PresaleAccount>,
    #[account(init_if_needed, payer = user, space = 8 + 16, seeds = [(b"user_account"), user.key().as_ref()], bump)]
    pub user_account: Account<'info, UserAccount>,
    #[account(mut)]
    /// CHECK: To pass payment wallet as account info
    pub payment_wallet: UncheckedAccount<'info>,
    #[account(address = Pubkey::from_str(CHAINLINK_PROGRAM).unwrap())]
    /// CHECK: This is safe as we are using chainlink program
    pub chainlink_program: UncheckedAccount<'info>,
    #[account(address = Pubkey::from_str(CHAINLINK_FEED).unwrap())]
    /// CHECK: This is safe as we are using chainlink feed
    pub chainlink_feed: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyWithUSDT<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"presale_account"], bump)]
    pub presale_account: Account<'info, PresaleAccount>,
    #[account(init_if_needed, payer = user, space = 8 + 16, seeds = [(b"user_account"), user.key().as_ref()], bump)]
    pub user_account: Account<'info, UserAccount>,
    #[account(mut)]
    pub user_usdt_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payment_wallet_usdt: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartClaim<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub presale_account: Account<'info, PresaleAccount>,
    #[account(mut)]
    pub owner_ata: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = owner, associated_token::mint = sale_token, associated_token::authority = presale_account)]
    pub presale_ata: Account<'info, TokenAccount>,
    pub sale_token: Account<'info, Mint>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"presale_account"], bump)]
    pub presale_account: Account<'info, PresaleAccount>,
    #[account(mut, close = user, seeds = [b"user_account", user.key().as_ref()], bump)]
    pub user_account: Account<'info, UserAccount>,
    #[account(mut, associated_token::mint = sale_token, associated_token::authority = presale_account)]
    pub presale_ata: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = user, associated_token::mint = sale_token, associated_token::authority = user)]
    pub user_ata: Account<'info, TokenAccount>,
    pub sale_token: Account<'info, Mint>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct IncrementCurrentRound<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub presale_account: Account<'info, PresaleAccount>,
}

#[account]
#[derive(InitSpace)]
pub struct PresaleAccount {
    pub owner: Pubkey,
    pub payment_wallet: Pubkey,
    pub payment_wallet_usdt: Pubkey,
    pub admin: Pubkey,
    pub start_time: u128,
    pub claim_start_time: u128,
    #[max_len(3, 4)]
    pub rounds: Vec<Vec<u128>>,
    pub is_paused: bool,
    pub max_tokens_to_buy: u128,
    pub current_round: u128,
    pub tokens_sold: u128,
    pub current_tracker: u128,
    pub usd_raised: u128,
    pub dynamic_time_change: bool,
    pub per_round_time: u128,
    #[max_len(4)]
    pub unsold_tokens: Vec<u128>,
    pub whitelist_claim_only: bool,
    pub usdt_token: Pubkey,
    pub sale_token: Pubkey,
    pub sale_token_decimals: u8,
    pub tokens_added: u128,
    pub tokens_claimed: u128,
    #[max_len(5)]
    pub whitelisted_users: Vec<Pubkey>,
}

#[account]
pub struct CalculateReturn {
    pub price_in_usd: u128,
    pub new_round: u128,
}

impl CalculateReturn {
    pub fn new(price_in_usd: u128, new_round: u128) -> Self {
        Self {
            price_in_usd,
            new_round,
        }
    }
}

#[account]
pub struct UserAccount {
    pub purchased_amount: u128,
}

#[error_code]
pub enum PresaleErrors {
    #[msg("Start time should be in future")]
    InvalidStartTime,
    #[msg("Presale already started")]
    PresaleAlreadyStarted,
    #[msg("Amount exceeds Max tokens to buy")]
    InvalidAmount,
    #[msg("Presale has ended")]
    PresaleEnded,
    #[msg("Invalid buy amount")]
    InvalidBuyAmount,
    #[msg("Presale not started")]
    PresaleNotStarted,
    #[msg("Zero price")]
    ZeroPrice,
    #[msg("Presale is paused")]
    PresalePaused,
    #[msg("Passed wrong payment wallet")]
    IncorrectPaymentWallet,
    #[msg("Presale not ended")]
    PresaleNotEnded,
    #[msg("Tokens to add should be greater than tokens sold")]
    IncorrectSaleTokenAdded,
    #[msg("Incorrect claim start time, claim should be in future")]
    IncorrectClaimStartTime,
    #[msg("Zero Decimals for sale token")]
    ZeroDecimals,
    #[msg("Claim not started yet")]
    ClaimNotStarted,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Only owner or admin")]
    AccessRestricted,
    #[msg("Invalid length for whitelisted users")]
    InvalidLength,
    #[msg("User is not whitelisted for claim")]
    NotClaimWhitelisted,
}
