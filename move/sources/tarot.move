#[allow(implicit_const_copy)]
module admin::mystic {
    use sui::url::{Self, Url};
    use std::string::{Self, String};
    use sui::object::{Self, ID, UID};
    use sui::event;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use std::vector;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::random::{Self, Random, new_generator};
    //use std::debug;

    #[test_only]
    use sui::test_scenario::{Self, ctx};
    #[test_only]
    use sui::test_utils::assert_eq;
    #[test_only]
    use sui::random::{update_randomness_state_for_testing};

    //==============================================================================================
    // Constants
    //==============================================================================================
    const PRICE: u64 = 1000000000; //1SUI

    const MAJOR_ARCANA_CARD_URI: vector<u8> = b"ipfs://bafybeifrqo4oorpn2y2l7vy5y4v4tqebvho5q5hg5rfsx2rafzng3u556q/";

    const MAJOR_ARCANA_NAME: vector<vector<u8>> = vector[
       (b"0 The Fool"),
        (b"I The Magician"),
        (b"II The High Priestess"),
        (b"III The Empress"),
        (b"IV The Emperor"),
        (b"V The Hierophant"),
        (b"VI The Lovers"),
        (b"VII The Chariot"),
        (b"VIII Strength"),
        (b"IX The Hermit"),
        (b"X The Wheel of Fortune"),
        (b"XI Justice"),
        (b"XII The Hanged Man"),
        (b"XIII Death"),
        (b"XIV Temperance"),
        (b"XV The Devil"),
        (b"XVI The Tower"),
        (b"XVII The Star"),
        (b"XVIII The Moon"),
        (b"XIX The Sun"),
        (b"XX Judgement"),
        (b"XXI The World")
    ];

    const NFT_DESC: vector<u8> = b"Unveiling a harmonious union between the celestial realm's profound wisdom and the revolutionary capabilities of blockchain technology, witness the universe's responses to your inquiries, transcending limitations and delving into the mystical realms.";

    //==============================================================================================
    // Error codes
    //==============================================================================================
    /// Insufficient funds
    const EInsufficientFunds: u64 = 1;

    //==============================================================================================
    // Structs 
    //==============================================================================================
    struct Counter has key {
        id: UID,
        //no of minted nft from this contract collection
        minted: u64
    }

    struct MysticTarotReading has key, store {
        id: UID,
        /// Name for the token
        name: String,
        description: String,
        url: Url,
        royalty_numerator: u64,
        /// question asked
        question: String,
        /// card drawn
        card: String,
        // position: upright/reverse
        position: String,
        /// reading
        reading: String,
    }

    //==============================================================================================
    // Event Structs 
    //==============================================================================================

    struct CardDrawn has copy, drop {
        // card name
        card: String,
        // card uri
        card_uri: Url,
        // position: upright/reverse
        position: String
    }

    struct NFTMinted has copy, drop {
        // The Object ID of the NFT
        object_id: ID,
        // The creator of the NFT
        creator: address,
        // The name of the NFT
        name: String,
        card: String,
        position: String
    }

    //==============================================================================================
    // Init
    //==============================================================================================

    fun init(ctx: &mut TxContext) {
        transfer::share_object(Counter{id: object::new(ctx), minted: 0});
    }

    //==============================================================================================
    // Entry Functions 
    //==============================================================================================

    //draws card
    entry fun draws_card(r: &Random, ctx: &mut TxContext) {
    let generator = new_generator(r, ctx); // generator is a PRG
    let card_no = random::generate_u64_in_range(&mut generator, 0, 21);
    let position =
        if(random::generate_u8_in_range(&mut generator, 0, 1) == 0){
            string::utf8(b"upright")
        }else{string::utf8(b"reverse")};
    let card_uri = string::utf8(MAJOR_ARCANA_CARD_URI);
    let card = string::utf8(*vector::borrow(&MAJOR_ARCANA_NAME, card_no));
    string::append(&mut card_uri, num_to_string(card_no));
    string::append_utf8(&mut card_uri, b".png");
    event::emit(CardDrawn {
        card,
        card_uri: url::new_unsafe_from_bytes(*string::bytes(&card_uri)),
        position
    });
    }

    /// Create a new nft
    public entry fun mint_card(
        question: String,
        reading: String,
        card: String,
        position: String,
        payment: Coin<SUI>, 
        counter: &mut Counter,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert_correct_payment(coin::value(&payment));
        transfer::public_transfer(payment, @treasury);
        let (_found, card_no) = vector::index_of(&MAJOR_ARCANA_NAME, string::bytes(&card));
        let card_uri = string::utf8(MAJOR_ARCANA_CARD_URI);
        string::append(&mut card_uri, num_to_string(card_no));
        string::append_utf8(&mut card_uri, b".png");
        let name = string::utf8(b"Mystic_Tarot_#");
        string::append(&mut name, num_to_string(counter.minted + 1));
        
        let nft = MysticTarotReading {
            id: object::new(ctx),
            name,
            description: string::utf8(NFT_DESC),
            url: url::new_unsafe_from_bytes(*string::bytes(&card_uri)),
            royalty_numerator: 5,
            question,
            card,
            position,
            reading
        };

        event::emit(NFTMinted {
            object_id: object::id(&nft),
            creator: sender,
            name: nft.name,
            card: nft.card,
            position: nft.position
        });
        counter.minted = counter.minted + 1;
        transfer::public_transfer(nft, sender);
    }

    /// Transfer `nft` to `recipient`
    public entry fun transfer(
        nft: MysticTarotReading, recipient: address, _: &mut TxContext
    ) {
        transfer::public_transfer(nft, recipient)
    }

    /// Update the `description` of `nft` to `new_description`
    /// ## possible implementation for updating whether reading came true
    // public entry fun update_description(
    //     nft: &mut MysticTarotReading,
    //     new_description: vector<u8>,
    //     _: &mut TxContext
    // ) {
    //     nft.description = string::utf8(new_description)
    // }

    /// Permanently delete `nft`
    public entry fun burn(nft: MysticTarotReading, _: &mut TxContext) {
        let MysticTarotReading { 
            id, 
            name: _, 
            description: _, 
            url: _,
            royalty_numerator: _,
            question: _,
            card: _,
            position: _,
            reading: _
        } = nft;
        object::delete(id)
    }

    //==============================================================================================
    // Public View Functions 
    //==============================================================================================


    //==============================================================================================
    // Helper Functions 
    //==============================================================================================

    fun num_to_string(num: u64): String {
        use std::string;
        let num_vec = vector::empty<u8>();
        if (num == 0) {
            vector::push_back(&mut num_vec, 48);
        } else {
            while (num != 0) {
                let mod = num % 10 + 48;
                vector::push_back(&mut num_vec, (mod as u8));
                num = num / 10;
            };
        };

        vector::reverse(&mut num_vec);
        string::utf8(num_vec)
    }

    fun assert_correct_payment(payment: u64){
        assert!(payment == PRICE, EInsufficientFunds);
    }

    //==============================================================================================
    // Tests 
    //==============================================================================================
    #[test]
    fun test_init_success() {
        let module_owner = @0xa;

        let scenario_val = test_scenario::begin(module_owner);
        let scenario = &mut scenario_val;

        {
            init(test_scenario::ctx(scenario));
        };
        let tx = test_scenario::next_tx(scenario, module_owner);
        let expected_events_emitted = 0;
        let expected_created_objects = 1;
        assert_eq(
            test_scenario::num_user_events(&tx), 
            expected_events_emitted
        );
        assert_eq(
            vector::length(&test_scenario::created(&tx)),
            expected_created_objects
        );
        test_scenario::end(scenario_val);
    }


    #[test]
    fun test_draw_card_success() {
        let module_owner = @0x0;
        let user = @0xa;
        
        let scenario_val = test_scenario::begin(module_owner);
        let scenario = &mut scenario_val;

        // Setup randomness
        random::create_for_testing(ctx(scenario));
        test_scenario::next_tx(scenario, module_owner);
        let random_state = test_scenario::take_shared<Random>(scenario);
        update_randomness_state_for_testing(
            &mut random_state,
            0,
            x"1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F",
            test_scenario::ctx(scenario),
        );
        test_scenario::next_tx(scenario, user);
        init(test_scenario::ctx(scenario));
        test_scenario::next_tx(scenario, user);
        draws_card(&random_state, test_scenario::ctx(scenario));
        let tx = test_scenario::next_tx(scenario, user);
        let expected_events_emitted = 1;
        assert_eq(
            test_scenario::num_user_events(&tx), 
            expected_events_emitted
        );
        test_scenario::return_shared(random_state);
        test_scenario::end(scenario_val);
    }

    #[test]
    fun test_mint_nft_success() {
        let module_owner = @0x0;
        let user = @0xa;
        
        let scenario_val = test_scenario::begin(module_owner);
        let scenario = &mut scenario_val;

        // Setup randomness
        random::create_for_testing(ctx(scenario));
        test_scenario::next_tx(scenario, module_owner);
        let random_state = test_scenario::take_shared<Random>(scenario);
        update_randomness_state_for_testing(
            &mut random_state,
            0,
            x"1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F",
            test_scenario::ctx(scenario),
        );
        test_scenario::next_tx(scenario, user);
        init(test_scenario::ctx(scenario));
        test_scenario::next_tx(scenario, user);
        draws_card(&random_state, test_scenario::ctx(scenario));
        test_scenario::next_tx(scenario, user);
        let question = string::utf8(b"question");
        let reading = string::utf8(b"reading");
        let card = string::utf8(*vector::borrow(&MAJOR_ARCANA_NAME, 0));
        let position = string::utf8(b"upright");
        {
            let counter = test_scenario::take_shared<Counter>(scenario);
            let payment = coin::mint_for_testing<SUI>(PRICE, test_scenario::ctx(scenario));
            mint_card(
                question,
                reading,
                card,
                position,
                payment, 
                &mut counter,
                test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(counter);
        };
        
        let tx = test_scenario::next_tx(scenario, user);
        let expected_events_emitted = 1;
        assert_eq(
            test_scenario::num_user_events(&tx), 
            expected_events_emitted
        );

        {
            let nft = test_scenario::take_from_sender<MysticTarotReading>(scenario);

            assert_eq(
                nft.name, 
                string::utf8(b"Mystic_Tarot_#1")
            );

            test_scenario::return_to_sender(scenario, nft);
        };
        
        test_scenario::return_shared(random_state);
        test_scenario::end(scenario_val);
    }

}