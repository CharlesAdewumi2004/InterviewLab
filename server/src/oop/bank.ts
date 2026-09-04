// OOP / low-level design question bank (machine-coding round). Same shape of
// contract as the system-design bank: `prompt` is the one-to-two vague
// sentences the interviewer says out loud; everything in `brief` is PRIVATE
// ground truth released one fact at a time.

export type OopDifficulty = 'easy' | 'medium' | 'hard';

export interface OopQuestion {
  id: string;
  title: string;
  difficulty: OopDifficulty;
  asks: string; // one line: what's being designed
  patterns: string[]; // the design patterns/principles that are the signal
  prompt: string; // spoken by the interviewer, deliberately underspecified
  brief: {
    requirements: string[]; // what a good candidate extracts by asking
    entities: string[]; // expected core classes + relationships
    interfaces: string[]; // key methods and why they're shaped that way
    patternNotes: string[]; // where each pattern applies; what using/missing it signals
    extensions: string[]; // "now add X" escalations and what a good answer preserves
    commonMistakes: string[];
    skeleton: string; // private reference skeleton (C++-flavoured outline)
  };
}

// Spliced in from the authoring workflow.
export const OOP_BANK: OopQuestion[] = [
  {
    "id": "oop-parking-lot",
    "title": "Parking Lot",
    "difficulty": "easy",
    "asks": "Class design for a parking lot: vehicles in, tickets out, fees on exit",
    "patterns": [
      "Strategy",
      "Composition over inheritance",
      "Single Responsibility",
      "Encapsulation"
    ],
    "prompt": "Let's design a parking lot. Show me the classes you'd write for the software that runs one.",
    "brief": {
      "requirements": [
        "What parks here? Land on three vehicle types (motorcycle, car, van) and spot sizes (small, medium, large) with a fit rule: a vehicle fits its own size or larger. If they never ask, they'll design for 'a car' and the first extension breaks them.",
        "Entry/exit flow: park() issues a Ticket recording spot and entry time; unpark(ticket) frees the spot and computes a fee. The Ticket is the handle — the customer should never hold a pointer to a spot.",
        "Fee model: hourly rate is fine for v1, but they should ask 'how are fees calculated?' — the answer 'hourly today, but pricing changes' is the deliberate hook for Strategy.",
        "Capacity queries: 'is there space for a van right now?' — cheap to support if spot state is encapsulated, awkward if they scatter occupancy booleans.",
        "Scope-downs a good candidate proposes: single level (floors are an extension), no payment hardware, no reservations, single-threaded unless asked."
      ],
      "entities": [
        "ParkingLot — orchestrator; owns the spots, issues tickets, delegates pricing; should NOT contain fee math or fit rules inline",
        "ParkingSpot — id + SpotSize + occupancy state; knows fits(VehicleType) and occupy/release; state changes only through its methods",
        "Vehicle — plate + VehicleType enum; a struct, not a hierarchy (nothing polymorphic about a vehicle here)",
        "Ticket — value object: ticketId, spotId, plate, entryTime; the join between a vehicle and a spot for the duration of a stay",
        "PricingStrategy (abstract) with HourlyPricing concrete — injected into ParkingLot"
      ],
      "interfaces": [
        "std::optional<Ticket> ParkingLot::park(const Vehicle&) — optional (or error result) because 'lot full' is a normal outcome, not an exception; returning a raw spot pointer leaks internals",
        "double ParkingLot::unpark(const Ticket&) — takes the ticket back, frees the spot, returns the fee; keeps the caller ignorant of spots entirely",
        "bool ParkingSpot::fits(VehicleType) const — the fit rule lives on the spot, in ONE place; if it's an if-ladder inside park(), adding a spot type touches the orchestrator",
        "virtual double PricingStrategy::fee(const Ticket&, TimePoint exit) const = 0 — takes the whole ticket so a weekend or per-vehicle-type policy can be added without changing the signature",
        "Internal findSpot(VehicleType) — the allocation policy (first-fit vs best-fit) isolated in one method; naming it as a future Strategy is a bonus, extracting it now is not required"
      ],
      "patternNotes": [
        "Strategy (pricing): the core signal. Injecting PricingStrategy shows they separate policy from mechanism; hardcoding rate math inside unpark() means the 'add weekend pricing' extension forces edits to ParkingLot — call that out in debrief. A grad who says 'I'd start hardcoded and extract Strategy when a second policy appears' with the seam identified is also a pass.",
        "Composition over inheritance: the classic failure is a subclass explosion — MotorcycleSpot/CarSpot/VanSpot or Vehicle→Car→SUV hierarchies with no behavioral difference. Enums + a fits() rule is the pragmatic answer; choosing it and saying WHY (no varying behavior, only varying data) is a strong-grad tell.",
        "Single Responsibility: ParkingLot that stores spots AND computes fees AND embeds fit rules is the God-class smell; the fix is exactly the entity split above. Watch whether pricing and fit logic each live in one named home.",
        "Encapsulation: spot occupancy mutated only via occupy()/release(), tickets as the public handle. Candidates who expose spots_ or return ParkingSpot& from park() fail the 'now add reservations' extension because callers already depend on internals.",
        "Singleton (probe, not required): many candidates reflexively make ParkingLot a singleton. Ask why. 'Because there's one lot' is cargo-culting — it kills testability with two lots in a test; constructing it and passing it in is the better default. Recognizing this under the probe is a positive signal."
      ],
      "extensions": [
        "Add electric spots with charging — good answers add an enum value/flag and one fits/rate rule; if it requires new subclasses or edits to park(), the abstraction failed",
        "Add multiple floors — Floor becomes a container of spots; park() delegates floor selection; preserved if allocation was already isolated in findSpot()",
        "Weekend/evening pricing — swap or decorate PricingStrategy; ParkingLot must not change; this is the payoff moment for the Strategy discussion",
        "Lost ticket — flat max fee; trivially a new PricingStrategy path IF fee computation takes the ticket, awkward if unpark() recomputes from spot state",
        "Real-time free-spot count per size — cheap if spot state is encapsulated (maintain counters on occupy/release); painful if occupancy was scattered"
      ],
      "commonMistakes": [
        "Vehicle/spot inheritance hierarchies with zero varying behavior — over-engineering, the #1 easy-round failure",
        "God-class ParkingLot holding fee math, fit rules, and allocation inline",
        "No Ticket entity — park() returns a spot reference or index and exit takes 'the spot back'",
        "Modeling out of scope: payment terminals, gates, cameras, floors-with-elevators, before park/unpark works",
        "Fee logic that can't see entry time (storing only 'occupied' bool, no timestamp — unpark can't price the stay)",
        "Jumping to thread-safety/mutexes before the single-threaded design is coherent (fine to mention, wrong to lead with)"
      ],
      "skeleton": "enum class VehicleType { Motorcycle, Car, Van };\nenum class SpotSize { Small, Medium, Large };\n\nstruct Vehicle {\n    std::string plate;\n    VehicleType type;\n};\n\nclass ParkingSpot {\npublic:\n    ParkingSpot(int id, SpotSize size);\n    bool fits(VehicleType t) const;      // fit rule lives HERE, one place\n    bool isFree() const;\n    void occupy(const std::string& plate);\n    void release();\n    int id() const;\nprivate:\n    int id_;\n    SpotSize size_;\n    std::optional<std::string> plate_;   // nullopt == free\n};\n\nusing TimePoint = std::chrono::system_clock::time_point;\n\nstruct Ticket {\n    int ticketId;\n    int spotId;\n    std::string plate;\n    TimePoint entryTime;\n};\n\nclass PricingStrategy {\npublic:\n    virtual ~PricingStrategy() = default;\n    virtual double fee(const Ticket& t, TimePoint exitTime) const = 0;\n};\n\nclass HourlyPricing : public PricingStrategy {\npublic:\n    explicit HourlyPricing(double ratePerHour);\n    double fee(const Ticket& t, TimePoint exitTime) const override;\nprivate:\n    double ratePerHour_;\n};\n\nclass ParkingLot {\npublic:\n    ParkingLot(std::vector<ParkingSpot> spots,\n               std::unique_ptr<PricingStrategy> pricing);\n    std::optional<Ticket> park(const Vehicle& v);   // nullopt: lot full\n    double unpark(const Ticket& t);                 // frees spot, returns fee\n    bool hasSpace(VehicleType t) const;\nprivate:\n    ParkingSpot* findSpot(VehicleType t);           // allocation policy seam\n    std::vector<ParkingSpot> spots_;\n    std::unordered_map<int, Ticket> activeByTicketId_;\n    std::unique_ptr<PricingStrategy> pricing_;\n    int nextTicketId_ = 1;\n};"
    }
  },
  {
    "id": "oop-vending-machine",
    "title": "Vending Machine",
    "difficulty": "easy",
    "asks": "Class design for a vending machine: money in, item out, change back",
    "patterns": [
      "State",
      "Single Responsibility",
      "Encapsulation"
    ],
    "prompt": "Design a vending machine — the software side. It takes coins, someone picks a snack, and it dispenses.",
    "brief": {
      "requirements": [
        "The happy path: insert coins → select item → dispense → return change. Get them to state it as an explicit sequence, because the design question is 'what is legal when' — that sequencing IS the state machine.",
        "Unhappy paths they must ask about (interviewer volunteers nothing): cancel mid-transaction (full refund of inserted coins), item out of stock after money is in, insufficient credit for the selected item, machine cannot make exact change.",
        "Change requires a coin float: the machine can only give change from coins it physically holds. Candidates who ask 'do I need to track the machine's own coins?' have seen the trap; those who don't will design makeChange() returning an amount, not coins.",
        "Restocking/collection is admin scope: acknowledge with a restock() method, don't design an admin subsystem.",
        "Scope-downs to propose: coins only (cards are the extension), one currency, prices in integer minor units (pence) — floating-point money is an instant probe."
      ],
      "entities": [
        "VendingMachine — thin orchestrator; public API delegates to the current state object; holds credit and wires Inventory + CashRegister together",
        "VendingState (abstract) with IdleState / HasCreditState / DispensingState — each legal event handled per state; transitions owned by the states",
        "Inventory — slot code → (Item, count); answers inStock, performs dispense decrement, restock; knows nothing about money",
        "CashRegister — the coin float plus coins inserted this transaction; makeChange returns actual coins; refundInserted for cancel; knows nothing about items",
        "Item — value struct: code, name, priceMinor"
      ],
      "interfaces": [
        "VendingMachine::insertCoin(Coin) / selectItem(code) / cancel() — the entire public surface; each is one line delegating to state_->handler(*this, ...), which is the proof the State pattern is actually load-bearing",
        "virtual void VendingState::insertCoin/selectItem/cancel(VendingMachine&, ...) = 0 — every state must answer every event, even if the answer is 'reject/ignore'; this forces the candidate to enumerate the illegal combinations instead of discovering them in bugs",
        "bool CashRegister::canMakeChange(int amountMinor) const, checked BEFORE dispensing — sequencing check-then-act correctly (verify stock AND change, then dispense, then decrement) is the correctness signal of the whole question",
        "std::vector<Coin> CashRegister::makeChange(int) / refundInserted() — returning coins, not an int, because the machine's float constrains what change is possible",
        "Prices and credit as int minor units throughout — doubles for money is a probe-and-correct moment"
      ],
      "patternNotes": [
        "State: the canonical application — this question exists to see it. The smell it cures: `if (state == HAS_CREDIT && ...)` ladders duplicated across insertCoin/selectItem/cancel. Full pattern (abstract state, per-state classes) is the strong answer; a single centralized switch over a State enum is acceptable at grad level ONLY if they name the State pattern as the refactoring when states grow. State logic smeared across methods with no acknowledgment is the fail signal.",
        "Single Responsibility: Inventory and CashRegister as separate objects from the orchestrator. A VendingMachine holding a raw map of items, a coin list, and all the transition logic is the God-class version — the 'add card payments' extension then touches everything.",
        "Encapsulation: credit and coin float mutate only through defined events; dispense-then-check bugs (item released before change verified) usually trace to state being poked directly. Also watch that selectItem with insufficient credit does NOT eat the money.",
        "Strategy (unprompted bonus): a candidate who says 'payment could be a PaymentMethod interface so cards slot in later' is anticipating the extension — credit that; do not require it."
      ],
      "extensions": [
        "Add card payments — good answers introduce a PaymentMethod abstraction and note the state machine barely changes (HasCredit just gets funded differently); if card logic lands inside coin-handling code, SRP failed",
        "Add a maintenance/out-of-service mode — the payoff for State: one new state class rejecting all customer events, zero edits to existing states; with an if-ladder design this touches every method",
        "Exact-change-only mode — when the float can't break large coins, refuse or warn upfront; only answerable if CashRegister models real coins",
        "Promotions (2-for-1, discount windows) — pricing moves behind a small policy seam rather than reading item.price inline",
        "Multi-item purchase in one credit session — tests whether credit lifetime is cleanly owned (deduct and remain in HasCredit if credit > 0, rather than force-refunding)"
      ],
      "commonMistakes": [
        "State checks duplicated across every method instead of one owned mechanism — the exact smell the question tests for",
        "Change modeled as an amount, not coins — no float, so 'can't make change' is unrepresentable",
        "Dispensing before validating stock AND change availability (wrong check-then-act order)",
        "Money as double",
        "cancel()/refund path missing entirely — nobody asked about the unhappy path",
        "Modeling motors, sensors, and the coin slot hardware instead of the domain state machine"
      ],
      "skeleton": "enum class Coin { FivePence = 5, TenPence = 10, TwentyPence = 20,\n                  FiftyPence = 50, OnePound = 100 };\n\nstruct Item {\n    std::string code;    // \"A3\"\n    std::string name;\n    int priceMinor;      // pence — never double\n};\n\nclass Inventory {\npublic:\n    bool inStock(const std::string& code) const;\n    const Item* find(const std::string& code) const;  // nullptr if unknown\n    void dispense(const std::string& code);            // decrements count\n    void restock(const Item& item, int count);\nprivate:\n    std::unordered_map<std::string, std::pair<Item, int>> slots_;\n};\n\nclass CashRegister {\npublic:\n    void acceptInserted(Coin c);\n    bool canMakeChange(int amountMinor) const;   // check BEFORE dispensing\n    std::vector<Coin> makeChange(int amountMinor);\n    std::vector<Coin> refundInserted();          // cancel path\n    void commitInserted();                       // inserted coins join float\nprivate:\n    std::map<Coin, int> float_;                  // machine's own coins\n    std::vector<Coin> inserted_;                 // this transaction only\n};\n\nclass VendingMachine;  // fwd\n\nclass VendingState {\npublic:\n    virtual ~VendingState() = default;\n    virtual void insertCoin(VendingMachine& m, Coin c) = 0;\n    virtual void selectItem(VendingMachine& m, const std::string& code) = 0;\n    virtual void cancel(VendingMachine& m) = 0;\n};\n\nclass IdleState      : public VendingState { /* overrides */ };\nclass HasCreditState : public VendingState { /* overrides */ };\nclass DispensingState: public VendingState { /* overrides */ };\n\nclass VendingMachine {\npublic:\n    VendingMachine(Inventory inv, CashRegister reg);\n    void insertCoin(Coin c);                 // -> state_->insertCoin(*this, c)\n    void selectItem(const std::string& code);\n    void cancel();\nprivate:\n    friend class IdleState;\n    friend class HasCreditState;\n    friend class DispensingState;\n    void setState(std::unique_ptr<VendingState> s);\n\n    Inventory inventory_;\n    CashRegister register_;\n    int creditMinor_ = 0;\n    std::unique_ptr<VendingState> state_;    // starts Idle\n};"
    }
  },
  {
    "id": "oop-deck-of-cards",
    "title": "Deck of Cards + Blackjack",
    "difficulty": "easy",
    "asks": "A reusable 52-card deck, then a simple game (Blackjack) built on top of it",
    "patterns": [
      "Composition over inheritance",
      "Separation of data and rules",
      "Dependency injection (RNG)",
      "Value semantics"
    ],
    "prompt": "Design a standard deck of playing cards. Then use it to build a simple game — let's say Blackjack.",
    "brief": {
      "requirements": [
        "Deck basics: 52 cards, 4 suits × 13 ranks, shuffle, deal one card, how many remain, behavior when empty (deal returns optional/empty — decide explicitly, don't throw as an afterthought).",
        "The extraction that matters most: 'is a card's value a property of the card or of the game?' Ace is 1-or-11 in Blackjack, high in Poker, either in Rummy — so scoring belongs to the game. A candidate who asks which game before designing Card has the key insight already.",
        "Blackjack scope: deal 2 cards each, hit/stand, bust over 21, Ace as 1 or 11, dealer plays a fixed rule. Splitting/betting/insurance are all out — a good candidate scopes them out loud.",
        "Shuffle: ask how it should be tested. The answer — inject the RNG so a seeded engine gives a deterministic order — is the testability signal of the question.",
        "Jokers / multiple decks: fine to ask, correct to defer; the design just needs to not preclude them (Deck constructed from a card list)."
      ],
      "entities": [
        "Card — immutable value type: Rank + Suit, equality-comparable; NO game logic, no getValue()",
        "Deck — owns vector<Card>, shuffle(rng) and deal(); completely game-agnostic, the reuse target for every extension",
        "Hand — a player's cards; add() and read access; scoring does NOT live here either",
        "BlackjackGame — owns the Deck, the hands, and ALL the rules: score(), bust, hit/stand, dealer policy",
        "std::mt19937 (injected) — the RNG as a constructor parameter, not a global"
      ],
      "interfaces": [
        "std::optional<Card> Deck::deal() — empty deck is a normal state the caller must confront; better than throwing and far better than UB on an empty vector",
        "void Deck::shuffle(std::mt19937& rng) — RNG passed in, not constructed inside; a seeded test can assert exact deal order; using rand() inside is the classic untestable version",
        "int BlackjackGame::score(const Hand&) const — the Ace 1-or-11 rule lives HERE (count Aces as 11, demote to 1 while over 21); on Card or Hand it would be wrong for the next game",
        "Rank as an enum class with explicit values (Two = 2 ... Ace = 14) — gives ordering for free when a comparison-based game shows up, without committing Blackjack values into the type",
        "Card as a plain struct with defaulted operator== — value semantics; cards are copied and compared, never new'd or subclassed"
      ],
      "patternNotes": [
        "Composition over inheritance: the historic anti-pattern (straight out of older prep books) is `class BlackjackCard : public Card` with getValue() overridden per game. A candidate producing that hierarchy is pattern-matching from memory, not designing; the game composing a plain Deck is the correct shape. This is the single strongest discriminator in the question.",
        "Separation of data and rules: Card/Deck/Hand are dumb containers; BlackjackGame is the only place rules exist. Any scoring method on Card or Hand means War/Poker can't reuse them unchanged — say exactly that in debrief if it happens.",
        "Dependency injection (RNG): shuffle taking an engine is the difference between a testable deck and one whose tests are flaky by construction. Grads rarely volunteer it; asking 'how would you test shuffle?' and watching whether they invent injection is a calibrated probe.",
        "Value semantics: Card as an immutable copyable struct is idiomatic C++; a Card class with setters or heap-allocated polymorphic cards signals Java habits ported over — worth a gentle probe on why."
      ],
      "extensions": [
        "Now build War (or high-card) with the same Deck — the direct reuse test; passes if Deck/Card/Hand are untouched and only a new game class appears; Rank's explicit ordering pays off here",
        "Six-deck shoe for casino Blackjack — passes if Deck (or a Shoe) can be constructed from N standard sets; hard fails if 52 is baked into the logic rather than the default constructor",
        "Add jokers — a Rank/flag addition plus construction change; games that don't use jokers must not need edits",
        "Deterministic replay of a game for a bug report — the RNG-injection payoff: seed in, identical game out; impossible with internal rand()",
        "Dealer strategy variants (hit soft 17) — a small policy hook inside BlackjackGame; tests whether they can localize a rule change without inventing a framework"
      ],
      "commonMistakes": [
        "Card subclassed per game (BlackjackCard) or per suit — inheritance where a value type was needed",
        "getValue()/score on Card or Hand, hardcoding one game's rules into the reusable layer",
        "rand() % n inside shuffle — untestable and biased; no way to seed or inject",
        "Strings for suits and ranks instead of enums — typo-prone, no ordering",
        "deal() on an empty deck unhandled (UB via pop on empty vector)",
        "Designing a Game base-class framework with virtual play() before any single game works — over-abstraction on a 20-minute warmup"
      ],
      "skeleton": "enum class Suit { Clubs, Diamonds, Hearts, Spades };\nenum class Rank { Two = 2, Three, Four, Five, Six, Seven, Eight,\n                  Nine, Ten, Jack, Queen, King, Ace };  // Ace = 14\n\nstruct Card {                    // immutable value type — no game logic\n    Rank rank;\n    Suit suit;\n    bool operator==(const Card&) const = default;\n};\n\nclass Deck {\npublic:\n    Deck();                                // standard 52, ordered\n    explicit Deck(std::vector<Card> cards); // shoe / jokers extension seam\n    void shuffle(std::mt19937& rng);        // injected RNG => testable\n    std::optional<Card> deal();             // nullopt when empty\n    size_t remaining() const;\nprivate:\n    std::vector<Card> cards_;\n};\n\nclass Hand {\npublic:\n    void add(Card c);\n    const std::vector<Card>& cards() const;\nprivate:\n    std::vector<Card> cards_;               // no scoring here\n};\n\nclass BlackjackGame {                        // ALL rules live here\npublic:\n    explicit BlackjackGame(std::mt19937 rng);\n    void addPlayer(const std::string& name);\n    void dealInitial();                      // 2 cards each + dealer\n    void hit(const std::string& player);\n    void stand(const std::string& player);\n    bool isBust(const std::string& player) const;\n    int  score(const Hand& h) const;         // Ace = 1 or 11 decided HERE\n    void playDealer();                        // dealer hits below 17\nprivate:\n    std::mt19937 rng_;\n    Deck deck_;\n    Hand dealer_;\n    std::unordered_map<std::string, Hand> hands_;\n};"
    }
  },
  {
    "id": "oop-library",
    "title": "Library Loan Tracker",
    "difficulty": "easy",
    "asks": "Class design for a small library: members borrow book copies, due dates, late fines",
    "patterns": [
      "Type/instance split (Book vs BookCopy)",
      "Strategy",
      "Single Responsibility",
      "Observer (extension)"
    ],
    "prompt": "Design the software for a small library. Members borrow books and bring them back.",
    "brief": {
      "requirements": [
        "The question that decides the round: 'can the library hold multiple copies of the same book?' Yes — and a loan is against a specific physical copy, not a title. Candidates who ask this design Book vs BookCopy correctly from the start; those who don't build Book{count} and hit a wall when a loan needs an identity.",
        "Checkout rules to extract: loan period (14 days), per-member loan limit (say 5), a member with overdue items may be blocked from new checkouts — each is one question away.",
        "Returns and fines: late returns owe a fine (e.g., 25p/day past due). Ask whether fine policy varies (grace period? cap?) — 'it might' is the Strategy hook.",
        "History: does a return delete the loan or close it? Keeping closed loans (returnedOn set) supports 'what did I have out last month' — good candidates ask.",
        "Scope-downs to propose: no catalog search/browse UI, no payments (fines are computed, not collected), single branch, dates as values passed in (Clock injection acceptable but not required)."
      ],
      "entities": [
        "Book — pure metadata: ISBN, title, author; never has status, never has a count",
        "BookCopy — a physical item: copyId, ISBN linking to Book, CopyStatus; the thing that is actually borrowed",
        "Member — memberId, name, loan limit",
        "Loan — the association object: (copyId × memberId) + checkedOutOn/dueOn/returnedOn; open loan = returnedOn empty",
        "LoanService — the orchestrator enforcing limits and blocks, creating/closing Loans, delegating fines; keeps Book/Copy/Member as dumb data",
        "FinePolicy (abstract) with PerDayFine concrete — injected into LoanService"
      ],
      "interfaces": [
        "std::optional<Loan> LoanService::checkout(memberId, copyId, Date today) — nullopt (or error enum) covers copy-not-available, member-at-limit, member-blocked; all rules enforced in ONE place, not scattered on entities",
        "int LoanService::returnCopy(copyId, Date today) — closes the loan, flips copy status, returns the fine in minor units; caller never computes anything",
        "virtual int FinePolicy::fineMinor(const Loan&, Date returnedOn) const = 0 — takes the whole Loan so grace periods, caps, or per-member policies fit the same signature later",
        "Date parameters passed in from outside rather than the service calling now() internally — makes 'return it 20 days late' testable without mocking time; a strong-grad touch worth crediting",
        "std::vector<Loan> LoanService::loansFor(memberId) const — read path for the limit/overdue checks; falls out naturally if Loan is a real entity"
      ],
      "patternNotes": [
        "Type/instance split: THE signal of this question. Book{availableCount} works right up until returnCopy() needs to know which copy and whose loan — then it collapses. Getting Book/BookCopy right unprompted is a strong pass; recovering cleanly when probed ('what if we own three copies of the same title and one comes back damaged?') is acceptable; defending the counter after the probe is the fail.",
        "Strategy (fine policy): same seam as parking-lot pricing — FinePolicy injected, fine math out of returnCopy(). Hardcoded `daysLate * 25` inline is common and probeable: 'children's books have no fines — what changes?' should be answered with 'the policy object', not an if in returnCopy.",
        "Single Responsibility: watch WHERE rules live. Book holding borrower/dueDate fields, or Member holding a list of copy pointers, smears loan state across entities; the Loan entity + LoanService keeping data objects dumb is the clean shape. Loan as a first-class object is also what makes history and 'overdue loans for member' queries trivial.",
        "Observer (extension only): when holds are added, notifying the next member on return is the textbook Observer moment. Do not expect it in the base design; a candidate who names it during the extension — 'return triggers notify, the service shouldn't know about email' — shows pattern breadth. Hardcoding an email call inside returnCopy is the coupling smell to flag."
      ],
      "extensions": [
        "Holds/reservations — a queue per Book (title level, not copy level — a subtle correctness point) and a notification on return; good answers keep returnCopy's core untouched and name Observer for the notify",
        "Member tiers (student vs staff: different limits and loan periods) — a policy/params object on Member consumed by LoanService; hard fails if limits were hardcoded constants inside checkout",
        "Renewals with a max of 2 — extend Loan (renewalCount, new dueOn) and add LoanService::renew; only clean because Loan is a real entity holding its own dates",
        "No-fine grace period or fine cap — a new FinePolicy, zero LoanService changes; the payoff moment for the Strategy seam",
        "Second branch — copies gain a branchId and checkout rules stay put; tests whether copy identity was modeled cleanly enough to add a dimension"
      ],
      "commonMistakes": [
        "Book with availableCount and no copy identity — the defining mistake; loans have nothing concrete to reference",
        "Loan state stored ON Book or BookCopy (borrowerId/dueDate fields) instead of a Loan entity",
        "Fine math hardcoded inline in returnCopy with no seam",
        "Returns that delete the loan record — no history, and fine disputes are unanswerable",
        "Building catalog search / recommendation scope instead of the loan domain the question is actually about",
        "Business rules (limits, blocks) scattered across Member and BookCopy methods rather than enforced once in the service"
      ],
      "skeleton": "using Date = std::chrono::year_month_day;\n\nstruct Book {                        // metadata only — no status, no count\n    std::string isbn;\n    std::string title;\n    std::string author;\n};\n\nenum class CopyStatus { Available, OnLoan };\n\nclass BookCopy {                     // the physical thing that is borrowed\npublic:\n    BookCopy(int copyId, std::string isbn);\n    int copyId() const;\n    const std::string& isbn() const;\n    CopyStatus status() const;\nprivate:\n    friend class LoanService;        // only the service flips status\n    int copyId_;\n    std::string isbn_;\n    CopyStatus status_ = CopyStatus::Available;\n};\n\nstruct Member {\n    int memberId;\n    std::string name;\n    int maxLoans = 5;\n};\n\nstruct Loan {                        // the association object\n    int loanId;\n    int copyId;\n    int memberId;\n    Date checkedOutOn;\n    Date dueOn;\n    std::optional<Date> returnedOn;  // empty == still out\n};\n\nclass FinePolicy {\npublic:\n    virtual ~FinePolicy() = default;\n    virtual int fineMinor(const Loan& loan, Date returnedOn) const = 0;\n};\n\nclass PerDayFine : public FinePolicy {\npublic:\n    explicit PerDayFine(int pencePerDay);\n    int fineMinor(const Loan& loan, Date returnedOn) const override;\nprivate:\n    int pencePerDay_;\n};\n\nclass LoanService {                  // ALL rules enforced here\npublic:\n    explicit LoanService(std::unique_ptr<FinePolicy> fines);\n    void addCopy(BookCopy copy);\n    void addMember(Member m);\n    std::optional<Loan> checkout(int memberId, int copyId, Date today);\n    int  returnCopy(int copyId, Date today);   // closes loan, returns fine\n    std::vector<Loan> loansFor(int memberId) const;\n    std::vector<Loan> overdue(Date today) const;\nprivate:\n    std::unordered_map<int, BookCopy> copies_;      // by copyId\n    std::unordered_map<int, Member> members_;       // by memberId\n    std::unordered_map<int, Loan> openLoanByCopy_;  // active loans\n    std::vector<Loan> closedLoans_;                 // history kept\n    std::unique_ptr<FinePolicy> fines_;\n    int nextLoanId_ = 1;\n};"
    }
  },
  {
    "id": "oop-elevator-system",
    "title": "Elevator System",
    "difficulty": "medium",
    "asks": "Design the control software for the elevators in an office building",
    "patterns": [
      "State",
      "Strategy",
      "Observer (secondary)",
      "single-responsibility",
      "composition-over-inheritance"
    ],
    "prompt": "Design the software that controls the elevators in an office building. Walk me through your classes first, then sketch the key ones in code.",
    "brief": {
      "requirements": [
        "How many elevator cars? (interviewer: start with N cars in one bank, but design so one car works alone)",
        "Floor range and call types: hall calls are directional (up/down button on a floor), car calls are a target floor pressed inside — a strong candidate distinguishes these unprompted",
        "Scheduling policy: which car serves a hall call? (interviewer accepts nearest-available first, expects it isolated so it can change)",
        "Movement model: is this an event/tick-driven simulation or real hardware callbacks? (interviewer: tick-driven simulation is fine)",
        "Door behavior and dwell time in scope? (yes, as a state, not as a heavy Door class)",
        "Out of scope unless raised as extension: weight/overload, fire mode, multiple banks, threading"
      ],
      "entities": [
        "ElevatorCar — current floor, direction, sorted pending stops, owns a State object; knows nothing about other cars",
        "ElevatorState (abstract) with IdleState / MovingState / DoorsOpenState — each owns its transition logic",
        "HallCall{floor, direction} and CarCall{floor} — small value types, not classes with behavior",
        "SchedulingStrategy (abstract) with NearestAvailableStrategy — decides which car takes a hall call",
        "ElevatorController — owns the cars and the strategy, routes hall calls, ticks the system; NOT a Singleton",
        "Optional: FloorDisplay/Chime as Observers of car arrival events"
      ],
      "interfaces": [
        "ElevatorState::onTick(ElevatorCar&) and onStopRequested(ElevatorCar&, int floor) — behavior that varies by state lives in the state object; the car just delegates, which is the whole point of the pattern",
        "ElevatorCar::addStop(int), tick(), setState(unique_ptr<ElevatorState>) — car exposes intent, hides the stop set (std::set<int> so a LOOK sweep can find next stop in direction cheaply)",
        "SchedulingStrategy::selectCar(const HallCall&, vector<ElevatorCar>&) — takes read access to car positions/directions and returns an assignment; shaped this way so the policy can be swapped without touching car or controller internals",
        "ElevatorController::hallCall(HallCall) / carCall(carId, floor) / tick() — the only public surface; callers never reach into cars"
      ],
      "patternNotes": [
        "State: the elevator lifecycle (Idle -> Moving -> DoorsOpen -> ...) is the textbook behavior-varies-by-state smell. Using it signals the candidate sees that transition logic belongs with the state, not scattered. Missing it usually shows up as switch(status) inside tick(), addStop(), and openDoors() — three copies of the same conditional, which is procedural thinking. Note for grading: an enum + ONE well-contained transition function is acceptable at grad level IF they can articulate why State would be better as states multiply.",
        "Strategy for scheduling: separating 'which car gets this hall call' from 'how a car moves' signals they identified the axis most likely to change. Hardcoding nearest-car inside ElevatorController is a minor miss; putting scheduling inside ElevatorCar (a car choosing among its peers) is a major miss — wrong information expert.",
        "Observer (secondary, don't require it): floor displays or chimes subscribing to arrival events. Volunteering it unprompted when asked about displays is a plus; forcing it into the core design early signals pattern-stuffing.",
        "Singleton red flag: making ElevatorController a Singleton is a common cargo-cult reflex from LLD blog posts. Probe why; 'there's only one building' is not a reason to make construction global. Accepting a plain object owned by main signals maturity."
      ],
      "extensions": [
        "Now add a service/VIP mode where one car only answers keycard calls — good answer: a new SchedulingStrategy filter plus possibly a car mode flag; car movement code unchanged. Bad sign: if-statements sprinkled through MovingState.",
        "Now add fire mode: all cars cancel stops and return to ground floor — tests whether a global override composes with per-car state. Good answer: controller clears stop sets and forces a state transition through the existing setState seam; bad answer: a bool fireMode checked inside every state method.",
        "Now support destination dispatch (passenger types destination in the lobby) — pure Strategy swap plus a richer call type; if their HallCall/CarCall types are hardcoded into car internals this hurts.",
        "Now add an overload sensor: car won't close doors over max weight — good answer: a guard inside DoorsOpenState's exit transition, one place; bad answer: weight checks in controller and car and state."
      ],
      "commonMistakes": [
        "God ElevatorCar class with switch(state) replicated across every method — the exact thing State exists to kill",
        "Heavy modeling of Button, Door, Display, Panel classes while scheduling and state transitions — the actual hard part — stay anemic",
        "Scheduling logic inside ElevatorCar, requiring each car to know the whole fleet",
        "Not distinguishing directional hall calls from car calls, which makes any sensible scheduling impossible later",
        "Jumping to threads, message queues, or 'each elevator is a service' — this is single-process; the spec is class design",
        "Storing pending stops as an unordered vector then linearly scanning for next-stop-in-direction every tick without noting it"
      ],
      "skeleton": "enum class Direction { Up, Down, Idle };\n\nstruct HallCall { int floor; Direction dir; };\nstruct CarCall  { int floor; };\n\nclass ElevatorCar;\n\nclass ElevatorState {\npublic:\n    virtual ~ElevatorState() = default;\n    virtual void onTick(ElevatorCar& car) = 0;                 // advance one step\n    virtual void onStopRequested(ElevatorCar& car, int floor) = 0;\n    virtual const char* name() const = 0;\n};\n\nclass IdleState      : public ElevatorState { /* transitions to Moving */ };\nclass MovingState    : public ElevatorState { Direction dir_; /* LOOK sweep */ };\nclass DoorsOpenState : public ElevatorState { int dwellTicks_; };\n\nclass ElevatorCar {\npublic:\n    explicit ElevatorCar(int id);\n    void addStop(int floor);                  // car call or assigned hall call\n    void tick() { state_->onTick(*this); }\n    void setState(std::unique_ptr<ElevatorState> s);\n    int currentFloor() const; Direction direction() const;\n    bool hasStops() const; int nextStopInDirection() const;\nprivate:\n    int id_; int floor_ = 0;\n    std::set<int> stops_;                     // sorted: cheap LOOK sweeps\n    std::unique_ptr<ElevatorState> state_;\n};\n\nclass SchedulingStrategy {\npublic:\n    virtual ~SchedulingStrategy() = default;\n    virtual ElevatorCar& selectCar(const HallCall&, std::vector<ElevatorCar>&) = 0;\n};\nclass NearestAvailableStrategy : public SchedulingStrategy { /* ... */ };\n\nclass ElevatorController {\npublic:\n    ElevatorController(int numCars, std::unique_ptr<SchedulingStrategy> s);\n    void hallCall(const HallCall& c);         // strategy_->selectCar(...).addStop(...)\n    void carCall(int carId, int floor);\n    void tick();                              // ticks every car\nprivate:\n    std::vector<ElevatorCar> cars_;\n    std::unique_ptr<SchedulingStrategy> strategy_;\n};"
    }
  },
  {
    "id": "oop-chess-game",
    "title": "Chess Game",
    "difficulty": "medium",
    "asks": "Design a two-player chess game, focusing on piece modeling and rule enforcement",
    "patterns": [
      "polymorphism placement (piece geometry vs game legality)",
      "Command (make/unmake moves)",
      "composition-over-inheritance (sliding pieces)",
      "Factory (setup/promotion)",
      "GRASP information expert"
    ],
    "prompt": "Design a chess game that two people can play locally. I mainly care about how you model the pieces and enforce the rules.",
    "brief": {
      "requirements": [
        "Two local human players, standard rules, no AI or networking (interviewer confirms; AI is an extension)",
        "Which rules are in scope? Interviewer wants blocking, captures, and check handled in code, and at least a credible plan for castling, en passant, and promotion",
        "Does the game detect checkmate/stalemate or just reject illegal moves? (interviewer: legality first; mate detection should fall out of 'no legal moves')",
        "Undo/move history — nominally out of scope, but en passant and castling rights REQUIRE history, so a strong candidate discovers they need a move log anyway",
        "No timers, no notation export initially (extensions)"
      ],
      "entities": [
        "Board — owns 64 squares of std::unique_ptr<Piece>; exposes at(), make(Move), unmake(Move), isAttacked(square, byColor)",
        "Piece (abstract) + King/Queen/Rook/Bishop/Knight/Pawn — geometry only; color is a data member, never WhitePawn/BlackPawn subclasses",
        "Move — value type carrying from/to, flags (castle/en-passant/promotion), and captured-piece + prior-rights info so it can be unmade",
        "Game — turn management, legality filter (king safety), status; the only entity that knows about check",
        "Move history (vector<Move> inside Game) — feeds en passant, castling rights, undo",
        "Shared slidingMoves() helper (free function or component) used by Rook/Bishop/Queen"
      ],
      "interfaces": [
        "virtual std::vector<Move> Piece::pseudoLegalMoves(const Board&, Square from) const — the load-bearing signature: the piece gets READ access to the board (so it can handle blocking and captures) but returns only candidates; it deliberately cannot answer 'is this legal' because king safety is not its responsibility",
        "bool Game::tryMove(Square from, Square to) — looks up pseudo-legal candidates, then make/unmake on the board to test 'does my king end up attacked'; legality lives at game level",
        "Board::make(const Move&) / unmake(const Move&) — reversible mutation is what makes check detection cheap; the Move must carry enough to reverse itself (Command pattern in effect)",
        "Board::isAttacked(Square, Color) — reuses pseudoLegalMoves of the opponent, showing the abstraction pays for itself",
        "slidingMoves(board, from, span<const Square> directions) — Queen passes rook-rays + bishop-rays; kills triplicated ray-scan loops"
      ],
      "patternNotes": [
        "Polymorphism placement is THE signal of this question. The naive answer — virtual bool isValidMove(from, to) on each piece with no board parameter — cannot handle blocking pieces, capturing own pieces, or check. A candidate who volunteers 'the piece knows its movement geometry, but it can't know about check — that's the Game's job' has demonstrated correct responsibility assignment (information expert) and effectively passes the core of the question. A candidate who has to be dragged there via 'how does your rook know a pawn is in the way?' gets partial credit.",
        "Command (moves as reversible value objects): storing capture + prior castling rights in the Move enables make/unmake for check testing AND free undo later. Missing it forces either copying the whole board per candidate move (acceptable at grad level IF they name the cost) or mutating the live board with no way back (a correctness bug — probe it).",
        "Composition over inheritance for sliding pieces: Queen = rook rays + bishop rays via a shared helper. Writing three near-identical ray-scan loops in Rook, Bishop, Queen signals they reach for inheritance but not reuse. Subclassing Queen from Rook to 'inherit' movement is a worse signal — it's an is-a abuse.",
        "Factory (minor): initial board setup and pawn-promotion piece creation through one creation point. Nice-to-have; its absence costs little, but its presence makes the chess-960 extension trivial.",
        "Inheritance red flags: WhitePawn/BlackPawn as separate classes (color is data, direction is a sign flip), or subclassing Square. Either signals an inheritance reflex over data modeling."
      ],
      "extensions": [
        "Now add undo — should fall out of the move history + unmake for free; if their apply() destroys information (discards captured piece), this extension exposes it immediately",
        "Now add a new piece type, say an Archbishop (knight+bishop), for a variant mode — good answer: one new Piece subclass composing existing move helpers, plus a factory entry; if Game or Board contains switch-on-piece-type anywhere, this breaks and reveals it",
        "Now add an AI player — tests whether they introduce a Player abstraction (HumanPlayer/EnginePlayer both implement chooseMove(const Game&)) rather than bolting an if(isAI) into the game loop; also note their pseudo-legal generator is exactly the API an engine needs, which strong candidates point out",
        "Now add per-player clocks and move notation logging — Observer on a moveMade event; acceptable to just describe, tests whether Game has a single choke point where moves are committed"
      ],
      "commonMistakes": [
        "isValidMove(fromX, fromY, toX, toY) per piece with no board access — cannot see blockers; the most common grad-level failure",
        "Check detection by mutating the real board with no unmake and no copy — corrupts state on the not-taken branches",
        "Raw owning Piece* in a 2D array with no ownership story — in a C++ interview, expect unique_ptr and ask who deletes on capture",
        "Pawn logic (double-step, en passant, promotion) special-cased inside Game instead of inside Pawn + Move flags",
        "Forgetting castling rights and en passant target are HISTORY-dependent state — a board snapshot alone cannot validate them",
        "Modeling Player, Timer, Tournament before a single piece can move — inverted priorities for a rules-focused prompt"
      ],
      "skeleton": "enum class Color { White, Black };\nstruct Square { int file, rank; };\n\nstruct Move {\n    Square from, to;\n    enum class Flag { Normal, Castle, EnPassant, Promotion } flag = Flag::Normal;\n    // captured piece + prior castling/en-passant rights stored here => unmake-able\n};\n\nclass Board;\n\nclass Piece {\npublic:\n    explicit Piece(Color c) : color_(c) {}\n    virtual ~Piece() = default;\n    // Geometry only: candidates ignoring king safety. Board is read-only here.\n    virtual std::vector<Move> pseudoLegalMoves(const Board&, Square from) const = 0;\n    Color color() const { return color_; }\nprivate:\n    Color color_;   // color is data — never WhitePawn/BlackPawn\n};\n\n// Shared by Rook/Bishop/Queen — composition instead of three copied loops.\nstd::vector<Move> slidingMoves(const Board&, Square from,\n                               std::span<const Square> directions);\n\nclass Rook   : public Piece { /* slidingMoves(rookDirs) */ };\nclass Bishop : public Piece { /* slidingMoves(bishopDirs) */ };\nclass Queen  : public Piece { /* slidingMoves(rookDirs + bishopDirs) */ };\nclass Knight : public Piece { /* fixed offsets */ };\nclass King   : public Piece { /* one step + castle flag moves */ };\nclass Pawn   : public Piece { /* push, double-step, captures, EP, promotion */ };\n\nclass Board {\npublic:\n    const Piece* at(Square) const;\n    void make(const Move&);       // mutate\n    void unmake(const Move&);     // reverse using info stored in Move\n    bool isAttacked(Square, Color by) const;\nprivate:\n    std::array<std::unique_ptr<Piece>, 64> squares_;\n};\n\nclass Game {\npublic:\n    bool tryMove(Square from, Square to);      // pseudo-legal -> make/unmake king check\n    std::vector<Move> legalMoves(Color) const;\n    enum class Status { Ongoing, Check, Checkmate, Stalemate };\n    Status status() const;                     // mate == in check + no legal moves\nprivate:\n    bool leavesKingInCheck(const Move&) const; // make, isAttacked(king), unmake\n    Board board_;\n    Color toMove_ = Color::White;\n    std::vector<Move> history_;                // castling rights, EP, undo\n};"
    }
  },
  {
    "id": "oop-fifo-orders-min-lookup",
    "title": "FIFO Order System with O(1) Min Lookup",
    "difficulty": "medium",
    "asks": "Design a class-level order-processing system: strict FIFO processing plus constant-time lowest-price lookup",
    "patterns": [
      "encapsulation / information hiding (interface stable across data-structure swaps)",
      "complexity-driven design (monotonic min-deque)",
      "Facade",
      "single source of truth for order ownership",
      "Strategy (matching policy, extension only)"
    ],
    "prompt": "Design a system that accepts orders for a security. Orders must be processed first-come-first-served, and at any moment I should be able to ask for the lowest-priced order currently in the system. Talk through your design and complexity, then code the core classes.",
    "brief": {
      "requirements": [
        "Exact operation set: add(order), pollNext() (strict FIFO), minPriceOrder() — candidate must pin these down before designing; the interviewer deliberately says 'system' not 'queue'",
        "Complexity targets: min lookup O(1) is the hard requirement; add and poll should be O(1) amortized — candidate should ASK for targets, not assume",
        "Is cancel in scope? (interviewer: 'not yet' — it is the planned extension, and the honest candidate notes their structure choice depends on this answer)",
        "One security or many? (one; multi-symbol is an extension)",
        "Price representation: integer ticks/pennies, never double — a C++/finance candidate should raise this unprompted",
        "Single-threaded, in-memory, class-level — explicitly NOT a distributed system; redirect any microservices talk"
      ],
      "entities": [
        "Order — plain value type: id, price (int64 ticks), quantity, arrival timestamp",
        "OrderBook (facade) — the ONLY public surface: add / pollNext / minPriceOrder / empty",
        "fifo_: std::deque<Order> — arrival order, the single owner of Order data",
        "minDeque_: std::deque<pair<Price, OrderId>> — monotonic non-decreasing candidate minima; front is always the current min; stores id+price, not Order copies",
        "OrderBookManager (extension only) — unordered_map<Symbol, OrderBook>"
      ],
      "interfaces": [
        "void OrderBook::add(Order) — O(1) amortized: pop minDeque_ back while back.price > incoming price, then push {price, id}; each order enters/leaves the min-deque at most once",
        "Order OrderBook::pollNext() — O(1): pop fifo_ front; if its id equals minDeque_.front id, pop that too — the sync point candidates most often forget",
        "const Order& OrderBook::minPriceOrder() const — O(1): fifo_ lookup keyed off minDeque_.front (or return price+id); shaped as a const query with zero mutation",
        "The interface deliberately exposes NO iterators and NO internal containers — that opacity is what lets the internals swap to multiset+map when cancel arrives, without breaking a caller"
      ],
      "patternNotes": [
        "This question is scored primarily on encapsulation plus the data-structure insight, not GoF patterns. The 'aha' is the monotonic min-deque (min-queue technique): because departures are strictly FIFO, an auxiliary deque of non-decreasing prices gives O(1) min with O(1) amortized maintenance. A candidate who reaches it — even guided — and can argue the amortized bound clears the bar. A candidate who reaches for Strategy/Observer/Factory before nailing the structure is pattern cargo-culting; steer them back with 'what's the complexity of your min()?'",
        "Facade / information hiding: a small stable interface hiding the two-deque machinery signals they design for change; exposing std::deque publicly or returning non-const references to internals signals they think in scripts, not components.",
        "Single ownership of data: Order lives once (in fifo_); the min structure holds ids/prices only. Duplicating full Orders across containers signals they haven't thought about sync bugs — and in C++, about copies.",
        "A min-heap or std::multiset answer: gives O(log n) ops and O(1)-ish min but is only wrong-by-degree — treat it as a good fallback IF they keep FIFO processing in a separate queue and articulate the two-structure sync. It becomes the RIGHT answer once cancellation arrives, so a candidate who says 'deque now, multiset if you give me cancel' is showing exactly the judgment the question wants.",
        "Strategy is relevant only in the matching extension (priority policy); introducing it earlier is over-engineering."
      ],
      "extensions": [
        "Now add cancel(orderId) — the designed trap: arbitrary removal breaks the pure monotonic deque. Good answers: (a) lazy deletion — unordered_set of cancelled ids, skipped on pollNext/min, with a note on memory growth; or (b) swap internals to multiset<Price> + unordered_map<OrderId, ...> and state the new O(log n) bounds. Either way the PUBLIC INTERFACE must not change — that's the test of their encapsulation.",
        "Now add a sell side and match orders when prices cross — good answer grows toward a real limit order book: per-side std::map<Price, deque<OrderId>> with best bid/ask at the map ends, price-time priority preserved by the per-level FIFO deques; their existing min machinery becomes 'best ask' almost verbatim.",
        "Now support many symbols — OrderBookManager owning unordered_map<Symbol, OrderBook>; near-zero cost if the facade was clean, which is the point of asking.",
        "Now allow modifying an order's quantity or price — strong (bonus) answer knows modify-up-in-size or price change = cancel + re-add losing time priority, and says so; minimum bar is routing modify through existing cancel + add."
      ],
      "commonMistakes": [
        "min() as a linear scan of the queue without flagging it's O(n) — the baseline failure this question filters for",
        "A single min-heap as the only container — destroys FIFO processing order entirely; poll would return cheapest, not oldest",
        "Two containers that desync: popping the FIFO front without checking/popping the min-deque front (the id comparison is the crux)",
        "Popping the min-deque on add while back >= price instead of strictly >, silently breaking FIFO tie-breaks for equal prices (duplicates must stay)",
        "double for price — representation and comparison hazards; instant flag in a finance interview",
        "Full Order copies stored in both containers, or premature threads/locks/Kafka — the spec is single-process class design"
      ],
      "skeleton": "using OrderId = std::uint64_t;\nusing Price   = std::int64_t;   // integer ticks — never double\n\nstruct Order {\n    OrderId id;\n    Price price;\n    int quantity;\n    std::chrono::steady_clock::time_point received;\n};\n\n// Strict FIFO processing + O(1) min lookup.\nclass OrderBook {\npublic:\n    void add(Order o);                    // O(1) amortized\n    Order pollNext();                     // O(1), strict arrival order\n    const Order& minPriceOrder() const;   // O(1)\n    bool empty() const;\nprivate:\n    std::deque<Order> fifo_;              // arrival order; sole owner of Orders\n    // Monotonic non-decreasing prices; front == current min.\n    //  add : while (!empty && back.price > o.price) pop_back; push {price,id}\n    //  poll: if (fifo_.front().id == minDeque_.front().second) pop_front\n    std::deque<std::pair<Price, OrderId>> minDeque_;\n};\n\n// --- Extension seams (discussed, not pre-built) -------------------------\n// cancel(OrderId): lazy tombstones — std::unordered_set<OrderId> cancelled_,\n//   skipped during pollNext()/minPriceOrder(); OR swap internals to\n//   std::multiset<Price> + std::unordered_map<OrderId, Order> at O(log n).\n//   Public interface above stays identical either way.\n// Multi-symbol:\n// class OrderBookManager {\n//     std::unordered_map<std::string, OrderBook> books_;\n// };"
    }
  },
  {
    "id": "oop-movie-ticket-booking",
    "title": "Movie Ticket Booking with Seat Locking",
    "difficulty": "medium",
    "asks": "Design a cinema seat-booking system where concurrent users can never double-book a seat",
    "patterns": [
      "two-phase reservation (lock/confirm)",
      "dependency inversion (ISeatLockProvider)",
      "State (booking lifecycle)",
      "Strategy (pricing)",
      "RAII for lock release",
      "information expert (availability lives on Show)"
    ],
    "prompt": "Design the booking system for a cinema: users pick a showtime, choose seats, and pay. Two users must never end up holding the same seat.",
    "brief": {
      "requirements": [
        "Scope: one cinema, multiple screens, multiple shows per screen per day (interviewer confirms; a chain of cinemas is an extension)",
        "Users select SPECIFIC seats from a seat map, not just a count — this forces per-seat state and is the crux",
        "What happens between seat selection and payment? Interviewer wants the candidate to discover the hold: seats are locked for N minutes while the user pays, then released or confirmed — a candidate who goes straight from 'available' to 'booked' has missed the question",
        "Concurrency model: single process, in-memory, multiple threads (e.g. request handlers) — mutexes are the tool; NOT a distributed-locks/Redis question, though the abstraction should permit that later",
        "Payment itself is out of scope — model only its success/failure callback into the booking lifecycle",
        "Cancellations, refunds, waitlists: extensions"
      ],
      "entities": [
        "Movie, Screen — catalog data; Screen holds the STATIC seat layout only, never availability",
        "Show — movie + screen + start time; owns per-show booked-seat state (the key modeling insight: the same physical seat is free at 3pm and taken at 6pm)",
        "Seat — id + type (Regular/Premium); a value in the layout",
        "SeatLock — seat, show, owning user, expiry timestamp; knows how to answer expired(now)",
        "ISeatLockProvider (interface) + InMemorySeatLockProvider — atomic all-or-nothing multi-seat lock, internal mutex, lazy expiry",
        "Booking — Pending -> Confirmed / Expired / Cancelled lifecycle with transitions enforced in one place",
        "BookingService — orchestrates lock -> pending booking -> payment result -> confirm+markBooked or release"
      ],
      "interfaces": [
        "ISeatLockProvider::lockSeats(show, seats, user, ttl) -> bool — ALL-OR-NOTHING and atomic w.r.t. concurrent callers; the signature taking the full seat vector (rather than seat-at-a-time) is itself the design point, since per-seat calls reintroduce the race and can deadlock or partially hold",
        "ISeatLockProvider::validateLocks(show, seats, user) — confirm-time re-check that the payer still holds unexpired locks; its existence shows the candidate understands locks can expire mid-payment",
        "BookingService::startBooking(user, show, seats) -> optional<Booking> — the one choke point where holds are acquired; returns empty on contention rather than blocking",
        "BookingService::confirmBooking(booking, show) — validateLocks, then Show::markBooked, then Booking::confirm; ordering stated out loud is a grading point",
        "Show::isBooked(seat) / markBooked(seats) — availability queries answered by Show, the information expert",
        "Expiry: checked lazily against the timestamp whenever a lock is read — no background reaper thread needed at this scale, and the candidate should be able to defend that choice"
      ],
      "patternNotes": [
        "Two-phase reservation is what this question exists to test. The failure mode is check-then-act: 'if seat available, book it' — a TOCTOU race the moment two threads interleave. A candidate who names the race (any vocabulary — 'both users see it free, both book') and closes it by making multi-seat lock acquisition atomic under a mutex passes the core. One who only fixes it when the interviewer roleplays two simultaneous users gets partial credit; one who can't see it even then fails the question regardless of how pretty the class diagram is.",
        "Dependency inversion on ISeatLockProvider: coding BookingService against the interface signals they anticipate the 'multiple app servers' upgrade WITHOUT building distributed infrastructure today — exactly the YAGNI balance a grad should show. Hardwiring a map+mutex inside BookingService is a minor miss; building actual Redis talk into a single-process question is over-engineering (redirect).",
        "State on the booking lifecycle: legal transitions (only Pending can confirm; expired can't resurrect) enforced in Booking itself. Scattered status==\"PENDING\" string checks across the service signal weak invariants. A guarded enum is fully acceptable — a full GoF State object per status is overkill here, and saying so is a positive signal.",
        "RAII for lock release (C++-specific bonus): a lock-hold guard object releasing seats on destruction if not committed handles the 'payment threw an exception' path for free. Unprompted RAII here is a strong C++ instinct signal; its absence is fine if release-on-failure is handled explicitly.",
        "Information expert: availability on Show, layout on Screen. Putting an isBooked flag on Seat/Screen breaks the moment a second showtime exists — a modeling error that surfaces in the first extension probe.",
        "Strategy for pricing (seat type, showtime, day) — minor, mention-level; Singleton services are the usual cargo-cult flag, same probe as always."
      ],
      "extensions": [
        "How do expired locks actually free seats? — good answer compares lazy expiry (check timestamp on every read; zero threads, frees 'late' but never incorrectly) vs a background sweeper (frees promptly, adds a thread + more locking). Either is fine; wanting a timer thread PER LOCK is the bad answer.",
        "Now the cinema becomes a chain with multiple app servers — good answer: locks move to a shared store; ISeatLockProvider gets a new implementation and BookingService doesn't change a line. If they hardwired the map+mutex, this extension is a rewrite, and they should recognize that themselves.",
        "User locks 3 seats and payment fails or throws — all three must be released, no leaks; tests all-or-nothing thinking and (in C++) invites the RAII guard answer.",
        "Now add tiered pricing with promotional discounts — PricingStrategy, possibly Decorator for stacking discounts; low weight, tests they don't entangle price math with booking flow.",
        "Now notify waitlisted users when a seat frees — Observer hanging off the seat-release path; mainly tests that lock-release goes through one choke point that can emit an event."
      ],
      "commonMistakes": [
        "Check-availability-then-book with no atomic hold — the defining race; everything else is secondary to catching this",
        "Seat availability stored on Seat or Screen instead of per-Show — breaks with a second showtime on the same screen",
        "Locking seat-at-a-time in a loop instead of all-or-nothing — partial holds, and lock-ordering deadlock potential between two users grabbing overlapping sets",
        "One global mutex over the whole cinema without ever discussing granularity (per-show is the natural unit) — correctness fine, but silence on the tradeoff is the miss",
        "A dedicated timer thread per seat lock for expiry — heavyweight; lazy timestamp checks weren't considered",
        "Deep catalog modeling (City, Cinema, Movie, Genre, Review) while the locking core — the actual question — stays a stub",
        "Confirming a booking without re-validating the locks still exist and belong to this user (payment took longer than the TTL)"
      ],
      "skeleton": "using SeatId = std::string; using UserId = std::string; using ShowId = int;\nusing Clock  = std::chrono::steady_clock;\n\nstruct Seat { SeatId id; enum class Type { Regular, Premium } type; };\n\nclass Screen {                       // static layout ONLY — no availability here\npublic:\n    const std::vector<Seat>& layout() const;\n};\n\nstruct SeatLock {\n    SeatId seat; UserId owner; Clock::time_point expiresAt;\n    bool expired(Clock::time_point now) const { return now >= expiresAt; }\n};\n\nclass ISeatLockProvider {\npublic:\n    virtual ~ISeatLockProvider() = default;\n    // All-or-nothing; atomic w.r.t. concurrent callers.\n    virtual bool lockSeats(ShowId, const std::vector<SeatId>&, const UserId&,\n                           std::chrono::seconds ttl) = 0;\n    virtual void unlockSeats(ShowId, const std::vector<SeatId>&, const UserId&) = 0;\n    virtual bool validateLocks(ShowId, const std::vector<SeatId>&, const UserId&) = 0;\n};\n\nclass InMemorySeatLockProvider : public ISeatLockProvider {\n    // overrides ...\nprivate:\n    std::mutex m_;                   // guards locks_; expiry checked lazily on access\n    std::unordered_map<ShowId, std::unordered_map<SeatId, SeatLock>> locks_;\n};\n\nclass Show {\npublic:\n    Show(ShowId, int movieId, const Screen&, Clock::time_point start);\n    bool isBooked(const SeatId&) const;\n    void markBooked(const std::vector<SeatId>&);\nprivate:\n    std::unordered_set<SeatId> booked_;   // availability lives per-show\n};\n\nenum class BookingStatus { Pending, Confirmed, Expired, Cancelled };\n\nclass Booking {\npublic:\n    void confirm();                  // Pending -> Confirmed only; else throws\n    void expire();                   // Pending -> Expired\nprivate:\n    BookingStatus status_ = BookingStatus::Pending;\n    ShowId show_; UserId user_; std::vector<SeatId> seats_;\n};\n\nclass BookingService {\npublic:\n    BookingService(ISeatLockProvider&/*, PricingStrategy&*/);\n    // lockSeats (all-or-nothing) -> Pending booking; empty on contention\n    std::optional<Booking> startBooking(const UserId&, Show&, std::vector<SeatId>);\n    // validateLocks -> Show::markBooked -> Booking::confirm -> unlock\n    bool confirmBooking(Booking&, Show&);\n    void onPaymentFailed(Booking&, Show&);  // release ALL held seats\nprivate:\n    ISeatLockProvider& locks_;\n};"
    }
  },
  {
    "id": "oop-text-editor-undo-redo",
    "title": "Text Editor with Undo/Redo",
    "difficulty": "hard",
    "asks": "Design the class structure of a text editor supporting undo and redo",
    "patterns": [
      "Command",
      "Memento (as a trade-off discussion, not the default)",
      "Composite (macro/coalesced edits)",
      "SRP / separation of document from history"
    ],
    "prompt": "Design a text editor that supports undo and redo. Talk me through how you'd structure it, then sketch the classes in C++.",
    "brief": {
      "requirements": [
        "Edit operations in scope: insert and delete at a position first; replace/format can be composed later — candidate should ask rather than assume",
        "Linear history semantics: a new edit after one or more undos truncates the redo stack (candidate must state this explicitly — it's the classic correctness trap)",
        "Undo granularity: is each keystroke one undo step, or is a typed word/burst coalesced into one? (drives Composite)",
        "History is bounded: memory cap or max depth — unbounded history on a large document is a red flag if never mentioned",
        "Single document, single user, no concurrency — candidate should confirm this to justify a simple design rather than gold-plating",
        "Undo should ideally restore cursor/selection position, not just text (good candidates ask; it changes what commands capture)"
      ],
      "entities": [
        "Document — owns the text buffer, exposes insert/erase by position; representation (std::string now, gap buffer/rope later) is hidden behind it",
        "Command (abstract) — one reversible edit; concrete InsertCommand and EraseCommand each store exactly what's needed to invert themselves",
        "EraseCommand captures the erased text at execute time (you cannot invert a delete you didn't record)",
        "CompositeCommand — groups keystrokes into one undo unit; undoes children in reverse order",
        "History — owns two stacks of unique_ptr<Command> (undo/redo), applies commands, clears redo on new edit, enforces max depth",
        "Editor — thin facade translating input into commands and feeding History; knows nothing about how commands invert"
      ],
      "interfaces": [
        "Command::execute(Document&) / Command::undo(Document&) — the document is passed in, not stored, so commands are inert data + inverse logic, trivially testable, and hold no ownership of the document",
        "Document::erase(pos, len) returns the removed string — shaped this way precisely so EraseCommand can capture its inverse in one call",
        "History::apply(std::unique_ptr<Command>, Document&) — takes ownership, executes, pushes to undo stack, clears redo stack; ownership transfer via unique_ptr is the expected C++ idiom",
        "History::undo/redo return bool — caller (UI) needs to know if there was anything to undo; no exceptions for empty stacks",
        "Document exposes positions/ranges only, never iterators into its buffer — this is what lets the buffer become a rope later without touching any command"
      ],
      "patternNotes": [
        "Command is the core signal: storing deltas (O(edit size)) instead of snapshots (O(doc size)) shows the candidate reasons about memory. A candidate who snapshots the whole document per keystroke without flagging the cost has missed the point of the question",
        "Memento must appear as a trade-off, not an implementation: strong candidates articulate when snapshots win — operations that are hard to invert (regex replace-all, reformat-document) — and propose hybrid checkpointing (periodic snapshot + deltas between). Never mentioning memento at all is a gap; using only mementos is a bigger one",
        "Composite for keystroke coalescing: shows they thought about UX granularity vs data granularity. Missing it means every character is its own undo step and they never questioned it",
        "SRP: Document knows text, History knows sequencing, commands know inversion. Undo logic living inside Document (an undo() method on the buffer) signals the candidate couldn't find the seam",
        "Ownership discipline: unique_ptr stacks vs raw new/delete is a direct C++ maturity signal for a Bloomberg loop"
      ],
      "extensions": [
        "\"Coalesce a burst of typing into one undo step\" — CompositeCommand plus a timer/heuristic in Editor; a good answer changes nothing in the Command interface or History",
        "\"Undo should restore the cursor and selection too\" — commands capture cursor state alongside text state (a small memento inside the command); History untouched",
        "\"Now support regex replace-all — how do you undo it?\" — this is the memento escalation: either a composite of per-match deltas or a snapshot for that one command; a good answer picks per case and defends the memory trade-off",
        "\"The buffer becomes a rope for 1GB files\" — Document's position-based interface is the firewall; if their commands poked at buffer internals, everything breaks and they should admit it",
        "\"Replace linear undo with an undo tree (branching history)\" — only History changes (stack pair becomes a tree of nodes holding commands); Command and Document survive intact, which is the test of the abstraction"
      ],
      "commonMistakes": [
        "Snapshotting the full document per edit with no mention of memory cost",
        "EraseCommand that doesn't capture the deleted text — undo is impossible and they often don't notice until asked to walk through it",
        "Forgetting to clear the redo stack when a new edit arrives after an undo",
        "Putting undo/redo methods on Document itself (SRP violation, untestable history)",
        "Commands storing a raw Document* with no ownership story, or raw new/delete stacks",
        "No bound on history depth; no answer for what gets evicted",
        "Jumping straight to code without asking about granularity or history semantics — requirements extraction is graded"
      ],
      "skeleton": "class Document {\npublic:\n    void insert(size_t pos, std::string_view text);\n    std::string erase(size_t pos, size_t len);      // returns removed text -> enables inversion\n    std::string_view text() const;\nprivate:\n    std::string buffer_;                            // swappable: gap buffer / rope later\n};\n\nclass Command {\npublic:\n    virtual ~Command() = default;\n    virtual void execute(Document& doc) = 0;\n    virtual void undo(Document& doc) = 0;\n};\n\nclass InsertCommand : public Command {\npublic:\n    InsertCommand(size_t pos, std::string text);\n    void execute(Document& doc) override;           // doc.insert(pos_, text_)\n    void undo(Document& doc) override;              // doc.erase(pos_, text_.size())\nprivate:\n    size_t pos_;\n    std::string text_;\n};\n\nclass EraseCommand : public Command {\npublic:\n    EraseCommand(size_t pos, size_t len);\n    void execute(Document& doc) override;           // removed_ = doc.erase(pos_, len_)\n    void undo(Document& doc) override;              // doc.insert(pos_, removed_)\nprivate:\n    size_t pos_, len_;\n    std::string removed_;                           // captured at execute time\n};\n\nclass CompositeCommand : public Command {           // coalesced keystrokes = one undo step\npublic:\n    void add(std::unique_ptr<Command> cmd);\n    void execute(Document& doc) override;\n    void undo(Document& doc) override;              // children in reverse order\nprivate:\n    std::vector<std::unique_ptr<Command>> children_;\n};\n\nclass History {\npublic:\n    void apply(std::unique_ptr<Command> cmd, Document& doc); // execute, push, CLEAR redo\n    bool undo(Document& doc);\n    bool redo(Document& doc);\nprivate:\n    std::vector<std::unique_ptr<Command>> undo_, redo_;\n    size_t maxDepth_ = 1000;                        // bounded memory\n};\n\nclass Editor {                                      // facade: input -> commands\npublic:\n    void type(std::string_view text);               // may coalesce into CompositeCommand\n    void erase(size_t pos, size_t len);\n    void undo();\n    void redo();\nprivate:\n    Document doc_;\n    History history_;\n};"
    }
  },
  {
    "id": "oop-rate-limiter-library",
    "title": "Pluggable Rate Limiter Library",
    "difficulty": "hard",
    "asks": "Design a shared C++ rate-limiting library with swappable algorithms behind one interface",
    "patterns": [
      "Strategy",
      "Dependency injection (clock)",
      "Factory (per-key state)",
      "Separation of concurrency policy from algorithm"
    ],
    "prompt": "Several teams at the firm need rate limiting in their services, and they each want slightly different behavior. Design a rate-limiting library they can all share.",
    "brief": {
      "requirements": [
        "It is a library, not a service: no network, no background threads, no logging policy — callers decide what to do on rejection; candidate should surface this distinction unprompted or when nudged",
        "At least two algorithms with different semantics: token bucket (allows bursts up to capacity) vs sliding window (smooth cap over an interval) — swappable behind one interface, chosen per limiter instance",
        "tryAcquire is non-blocking and returns a decision; nobody sleeps inside the library",
        "Per-key limiting (per client/API key) as well as single-resource limiting — potentially very many keys",
        "Callers are multi-threaded; the library must define exactly where thread safety lives",
        "Time must be injectable — tests cannot sleep for 10 seconds to verify a 10-second window",
        "Memory must be bounded: sliding-window logs prune old timestamps; idle keys are evictable"
      ],
      "entities": [
        "RateLimitStrategy (abstract) — the pure algorithm: given 'now' and a permit count, decide and update internal state; owns no clock, no mutex",
        "TokenBucket : RateLimitStrategy — capacity + refill rate; refills lazily from lastRefill_ on each call (no background thread)",
        "SlidingWindowLog : RateLimitStrategy — deque of timestamps, pruned on each call; SlidingWindowCounter as the cheaper cousin if raised",
        "Clock — injected std::function or small interface returning steady_clock::time_point; production wires the real clock, tests wire a fake",
        "RateLimiter — the front door: owns one strategy, the clock, and the mutex; this is the single place concurrency lives",
        "KeyedRateLimiter — map key -> {strategy instance, lastSeen}; takes a StrategyFactory to mint independent state per key; owns eviction"
      ],
      "interfaces": [
        "bool RateLimitStrategy::tryAcquire(time_point now, uint32_t permits) — 'now' is a parameter, which makes every strategy a deterministic state machine: fully testable with a fake clock, no sleeps, and reusable under any locking scheme",
        "RateLimiter::tryAcquire(permits=1) — reads the injected clock, takes the lock, delegates; strategies never lock, so the wrapper can later shard or swap locking without touching algorithms",
        "StrategyFactory = std::function<std::unique_ptr<RateLimitStrategy>()> — KeyedRateLimiter can't share one strategy across keys (each key needs independent state), so it needs a way to make more; a factory is the honest shape of that need",
        "KeyedRateLimiter::evictIdle(olderThan) — explicit memory-control surface; its existence shows the candidate thought about a million idle keys",
        "Return type is bool today; a strong candidate notes it may need to become a small result struct (allowed + retryAfter) and designs so that widening it is cheap"
      ],
      "patternNotes": [
        "Strategy is the headline: two algorithms with completely different state shapes behind one call. An enum + switch inside a monolithic limiter is the direct fail signal — it means every new algorithm reopens the core class",
        "Clock injection is the testing-maturity signal: a candidate whose TokenBucket calls steady_clock::now() internally has written something that can only be tested with real sleeps. Passing 'now' into tryAcquire is the strongest version of the fix",
        "Factory for per-key state separates 'which algorithm/parameters' (configured once) from 'whose counters' (created per key). Missing it usually surfaces as one shared bucket accidentally throttling all clients together",
        "Locking in the wrapper, purity in the strategy: this layering shows the candidate can place a cross-cutting concern once. Locking inside every strategy (or both places) signals they don't know where the responsibility boundary is",
        "Library mindset: proposing a background refill thread is an anti-signal — lazy refill computed from elapsed time on access is the expected answer and shows they understand the deployment context"
      ],
      "extensions": [
        "\"Now it's per API client and there are a million keys\" — KeyedRateLimiter with factory + idle eviction (lastSeen + sweep or LRU); a good answer also shards the map/mutex rather than serializing all keys through one lock; RateLimitStrategy is untouched",
        "\"Another team wants sliding-window-counter to save memory\" — one new strategy class drops in; if anything else must change, the abstraction failed",
        "\"Callers want to know when to retry\" — tryAcquire returns a result struct with optional retryAfter; strategies compute it from their own state; tests whether the candidate can evolve an interface without breaking the pattern",
        "\"Now the limit must hold across multiple service instances\" — the correct grad answer is a boundary, not an implementation: the strategy state moves behind a store abstraction (e.g., token bucket as an atomic check-and-set in Redis); the caller-facing interface survives, and they should say local in-memory strategies remain for the single-process case",
        "\"Product wants burst of 100, then steady 10/s\" — token bucket with capacity 100, refill 10/s; checks they actually understand the semantic difference between the algorithms they just built"
      ],
      "commonMistakes": [
        "Calling the system clock inside the algorithm — untestable, and usually discovered only when asked 'how would you unit test the window expiry?'",
        "A background thread adding tokens on a timer instead of lazy refill",
        "Sliding window log that never prunes — unbounded deque growth",
        "One shared strategy instance behind KeyedRateLimiter — all clients share one budget",
        "A single global mutex over a million keys with no mention of sharding",
        "Building a service (HTTP endpoints, config server) when asked for a library",
        "Double-locking confusion: mutexes in both the strategies and the wrapper with no stated reason"
      ],
      "skeleton": "using TimePoint = std::chrono::steady_clock::time_point;\nusing Duration  = std::chrono::steady_clock::duration;\nusing Clock     = std::function<TimePoint()>;        // injected; tests use a fake\n\nclass RateLimitStrategy {                            // pure algorithm: no clock, no locks\npublic:\n    virtual ~RateLimitStrategy() = default;\n    virtual bool tryAcquire(TimePoint now, uint32_t permits) = 0;\n};\n\nclass TokenBucket : public RateLimitStrategy {\npublic:\n    TokenBucket(double capacity, double refillPerSec);\n    bool tryAcquire(TimePoint now, uint32_t permits) override; // lazy refill from lastRefill_\nprivate:\n    double capacity_, refillPerSec_, tokens_;\n    TimePoint lastRefill_;\n};\n\nclass SlidingWindowLog : public RateLimitStrategy {\npublic:\n    SlidingWindowLog(uint32_t maxRequests, Duration window);\n    bool tryAcquire(TimePoint now, uint32_t permits) override; // prune old, check count\nprivate:\n    uint32_t maxRequests_;\n    Duration window_;\n    std::deque<TimePoint> hits_;                     // pruned every call -> bounded\n};\n\nclass RateLimiter {                                  // concurrency + clock live HERE only\npublic:\n    RateLimiter(std::unique_ptr<RateLimitStrategy> s, Clock clock);\n    bool tryAcquire(uint32_t permits = 1);           // lock, now = clock_(), delegate\nprivate:\n    std::mutex mu_;\n    std::unique_ptr<RateLimitStrategy> strategy_;\n    Clock clock_;\n};\n\nclass KeyedRateLimiter {                             // per-client state\npublic:\n    using StrategyFactory = std::function<std::unique_ptr<RateLimitStrategy>()>;\n    KeyedRateLimiter(StrategyFactory make, Clock clock);\n    bool tryAcquire(const std::string& key, uint32_t permits = 1);\n    void evictIdle(Duration olderThan);              // bounded memory over many keys\nprivate:\n    struct Entry { std::unique_ptr<RateLimitStrategy> strategy; TimePoint lastSeen; };\n    std::unordered_map<std::string, Entry> perKey_;  // shard map+mutex at scale\n    std::mutex mu_;\n    StrategyFactory make_;\n    Clock clock_;\n};"
    }
  },
  {
    "id": "oop-matching-engine",
    "title": "In-Memory Order Matching Engine",
    "difficulty": "hard",
    "asks": "Design the class structure of an in-memory price-time priority order matching engine",
    "patterns": [
      "Observer (fills/executions)",
      "Composition over inheritance (orders are data, books have behavior)",
      "SRP (engine routes, book matches)",
      "Strategy (matching policy, as escalation)",
      "State (order lifecycle, lightweight)"
    ],
    "prompt": "Design the classes for an in-memory matching engine: it accepts buy and sell orders and produces trades. Start by telling me what you'd need to know, then sketch the design in C++.",
    "brief": {
      "requirements": [
        "Limit orders first (price + quantity); market orders and time-in-force are deferred — candidate should scope this explicitly rather than designing for everything",
        "Matching rule is price-time priority: best price wins; FIFO among orders at the same price — the candidate must state both halves",
        "Partial fills happen: an incoming order can sweep several resting orders and rest its remainder on the book",
        "Trades execute at the RESTING (maker) order's price, not the incoming order's price — candidates should either know or ask; getting it silently wrong is a correctness miss",
        "Cancel by order id must be fast — an O(n) book scan should make them uncomfortable",
        "Multiple downstream consumers need executions (market data, risk, logging) and the engine must not know who they are",
        "Multiple instruments: one independent book per symbol; the matching core can and should be single-threaded per book for determinism",
        "Prices are integer ticks, never floating point — a small but real signal for a finance-facing candidate"
      ],
      "entities": [
        "Order — dumb data: id, side, price (int ticks), remaining qty, sequence number for time priority; no behavior, no virtuals",
        "PriceLevel — FIFO queue of orders at one price (std::deque)",
        "OrderBook — one instrument: bids in a std::map<Price, Level, std::greater<>>, asks ascending; plus unordered_map<OrderId, Locator> for O(1)-ish cancel; owns the match loop",
        "Trade — value type: maker id, taker id, price, qty",
        "TradeListener (abstract) — onTrade/onAccept/onCancel; OrderBook publishes to registered listeners",
        "MatchingEngine — routes by symbol to the right book, assigns ids and sequence numbers; no matching logic of its own"
      ],
      "interfaces": [
        "OrderBook::submit(Order) — runs the match loop (while incoming qty > 0 and best opposite level crosses: fill at resting price, pop exhausted orders/levels), then rests the remainder; single entry point keeps the invariant 'book is always fully matched' in one place",
        "OrderBook::cancel(OrderId) -> bool — served by the id->Locator index; the index is the design element that makes cancel and later amend possible, and its absence is immediately visible under questioning",
        "TradeListener::onTrade(const Trade&) — pure virtual; the book iterates a vector of listener pointers; shaped as an interface precisely so risk/market-data/logging attach without the book knowing any of them",
        "bestBid()/bestAsk() -> std::optional<Price> — needed for crossing checks and later for FOK liquidity checks; optional because an empty side is a normal state, not an error",
        "MatchingEngine::submit(symbol, side, price, qty) -> OrderId — the engine owns id/sequence assignment so time priority is globally consistent per book"
      ],
      "patternNotes": [
        "Observer for executions is the named signal: hard-coding a std::cout fill report or calling a concrete RiskSystem from the match loop means the engine is welded to one consumer. Registering TradeListeners shows they can decouple a hot core from its audiences",
        "Composition over inheritance: the classic anti-signal here is an Order class hierarchy (LimitOrder/MarketOrder with virtual match()). Matching semantics belong to the book; orders are records. A candidate who reaches for virtuals on Order is modeling nouns, not responsibilities",
        "SRP: engine routes and assigns ids, book matches, order carries data. If one god class does all three, follow-ups (multi-symbol, threading) fall apart quickly and visibly",
        "Strategy stays holstered until the pro-rata escalation: extracting the match loop into a MatchingPolicy then — and only then — is the mature move; introducing it up front unprompted is acceptable but should be justified, not cargo-culted",
        "State (lightweight): naming the order lifecycle New -> PartiallyFilled -> Filled/Cancelled and rejecting cancels on filled orders shows lifecycle thinking; a full State pattern here is overkill and they should say so if asked"
      ],
      "extensions": [
        "\"Add market orders and IOC/FOK\" — time-in-force is submit-time policy in the book, not behavior on Order; FOK needs a liquidity pre-check (walk levels summing available qty before touching the book) — tests whether their book exposes enough to peek without mutating",
        "\"Add amend\" — the domain rule is the test: price change or qty increase loses time priority (cancel + reinsert), qty decrease keeps it (edit in place). Their id->Locator index either supports this or the gap shows",
        "\"New asset class matches pro-rata instead of FIFO\" — extract the match loop into a MatchingPolicy strategy owned by the book; Order, levels, index, and listeners all survive; that survival is the grade",
        "\"Make it handle many symbols under load\" — the right answer preserves the single-threaded-book invariant: shard books across threads (symbol -> thread affinity), queue orders in; a mutex per order or lock inside the match loop is the wrong instinct and should be challenged",
        "\"A listener (risk) is slow\" — don't block the match loop: hand events to a queue and let a dispatcher thread fan out (deliberately sets up the notification-dispatcher question); acknowledging the sync-observer weakness is worth real credit"
      ],
      "commonMistakes": [
        "Matching at the incoming order's price instead of the resting order's price",
        "storing all orders in one vector and scanning for the best price — no price-level structure",
        "Cancel by linear search; no id -> location index",
        "Virtual match() on an Order hierarchy",
        "Using double for price",
        "Forgetting partial fills — treating every match as all-or-nothing",
        "Adding a mutex inside the match loop 'for safety' instead of keeping the book single-threaded and pushing concurrency to the edges",
        "Letting listeners throw or block inside the match loop with no acknowledgment"
      ],
      "skeleton": "enum class Side { Buy, Sell };\nusing OrderId = uint64_t;\nusing Price   = int64_t;                     // integer ticks, never double\n\nstruct Order {                               // dumb data: matching lives in the book\n    OrderId  id;\n    Side     side;\n    Price    price;\n    uint64_t qty;                            // remaining\n    uint64_t seq;                            // time priority within a level\n};\n\nstruct Trade { OrderId maker, taker; Price price; uint64_t qty; };\n\nclass TradeListener {                        // observer: engine doesn't know consumers\npublic:\n    virtual ~TradeListener() = default;\n    virtual void onTrade(const Trade&) = 0;\n    virtual void onAccept(const Order&) {}\n    virtual void onCancel(OrderId) {}\n};\n\nclass OrderBook {                            // one instrument; single-threaded by design\npublic:\n    void addListener(TradeListener* l);\n    void submit(Order o);                    // match loop, then rest remainder\n    bool cancel(OrderId id);                 // via locator index, no scan\n    std::optional<Price> bestBid() const;\n    std::optional<Price> bestAsk() const;\nprivate:\n    using Level = std::deque<Order>;                          // FIFO within price\n    std::map<Price, Level, std::greater<Price>> bids_;        // best bid first\n    std::map<Price, Level>                      asks_;        // best ask first\n    struct Locator { Side side; Price price; };               // + position handle\n    std::unordered_map<OrderId, Locator> index_;              // fast cancel/amend\n    std::vector<TradeListener*> listeners_;\n    void match(Order& incoming);             // fills at RESTING (maker) price\n    void emit(const Trade& t);\n};\n\nclass MatchingEngine {                       // routes; owns id/seq assignment\npublic:\n    OrderId submit(const std::string& symbol, Side s, Price p, uint64_t qty);\n    bool    cancel(const std::string& symbol, OrderId id);\n    void    addListener(TradeListener* l);   // fan to books\nprivate:\n    std::unordered_map<std::string, OrderBook> books_;\n    uint64_t nextId_ = 1;\n    uint64_t nextSeq_ = 1;\n};"
    }
  },
  {
    "id": "oop-notification-dispatcher",
    "title": "Multi-Channel Notification Dispatcher with Retry",
    "difficulty": "hard",
    "asks": "Design a notification dispatcher that fans alerts out to pluggable channels with retries and dead-lettering",
    "patterns": [
      "Observer (topic subscription/routing)",
      "Strategy (channel transport + retry policy)",
      "Producer-consumer queue ownership",
      "Decorator (per-channel rate limiting, as escalation)"
    ],
    "prompt": "Design a system that alerts users when things happen on our platform — email, SMS, push, whatever we add next. Deliveries can fail. Walk me through your design, then sketch the classes.",
    "brief": {
      "requirements": [
        "Channels are open-ended: adding Slack next quarter must mean one new class, zero core edits — the candidate should extract this as the central constraint",
        "Routing: users subscribe to topics and have per-user channel preferences; producers of alerts must not know recipients or transports",
        "Sends are slow, flaky I/O: publish() must be non-blocking for the producer — an async queue between publish and delivery is required, and the candidate should reach it themselves",
        "Failures split into retryable (timeout, 5xx) vs permanent (invalid address) — retry only the former; this distinction should come from the candidate asking 'how do sends fail?'",
        "Retry with backoff and a max-attempt cap; after that the notification goes to a dead-letter sink, never silently vanishes",
        "Queue ownership must be explicit: the dispatcher owns the queue and worker threads; channels are passive and synchronous",
        "Shutdown semantics: drain vs drop is a real decision they should be asked to make",
        "Delivery guarantee: at-least-once is acceptable (dedup key on the notification); exactly-once should be called out as not achievable over SMTP/SMS"
      ],
      "entities": [
        "Notification — value type: id (dedup key), userId, topic, severity, body",
        "Channel (abstract) — one synchronous send attempt returning a status; EmailChannel, SmsChannel, PushChannel are dumb transports",
        "RetryPolicy (abstract) — nextDelay(attempt) -> optional<Duration>; nullopt means give up; ExponentialBackoff is the expected concrete",
        "SubscriptionRegistry — topic -> subscribed users, user -> preferred channels; produces (user, channel) delivery tasks",
        "DeadLetterSink (abstract) — receives exhausted notifications; concrete could log, page, or persist",
        "Dispatcher — the owner: holds the channels, the retry policy, the DLQ, a due-time-ordered task queue, and the worker pool; ~Dispatcher stops and joins"
      ],
      "interfaces": [
        "SendStatus Channel::send(const Notification&) — returns {Ok, RetryableError, PermanentError} instead of throwing: the tri-state is what lets the dispatcher own the retry decision, and 'no retries, no threads, no sleeps in here' is the contract worth saying out loud",
        "optional<Duration> RetryPolicy::nextDelay(int attempt) — a pure function of attempt count: testable without waiting, swappable per deployment, and the nullopt-means-dead encoding removes a separate maxAttempts channel of truth",
        "Dispatcher::publish(Notification) — expands via the registry into per-(user,channel) tasks and enqueues; returns immediately; this is the observer notify and it must be cheap",
        "The internal task queue is a min-heap ordered by 'due' time — a retry is re-enqueued with due = now + nextDelay(attempt), so workers never sleep holding a task; this queue shape is the mechanical heart of the design",
        "DeadLetterSink::onDead(notification, channelName) — an interface, not a log line, so the escalation path is itself pluggable"
      ],
      "patternNotes": [
        "Observer (registry-mediated): producers publish to topics and are fully decoupled from recipients. Producers hard-coding recipient lists or calling channels directly signals the candidate never separated 'what happened' from 'who hears about it'",
        "Strategy appears twice and the layering between them is the real test: Channel is the transport strategy, RetryPolicy is the failure strategy, and they must not know about each other. Retry loops written inside EmailChannel mean the policy gets duplicated per channel — the single strongest negative signal in this question",
        "Queue ownership is graded explicitly: strong answer — Dispatcher owns one delay queue + worker pool, channels are passive. Channels spawning their own threads, or a worker calling sleep(backoff) mid-task (starving the pool), are the two classic misses",
        "Producer-consumer mechanics: condition_variable wakeups, bounded queue with a stated backpressure choice (block vs shed low-severity), stop flag + join in the destructor — presence of these shows real C++ concurrency fluency, not just pattern vocabulary",
        "Decorator stays in reserve for the rate-limit escalation: wrapping a channel rather than editing it is the payoff move; candidates who edit EmailChannel to add throttling show they extend by modification, not composition"
      ],
      "extensions": [
        "\"Add a Slack channel\" — the litmus test: one new Channel subclass registered with the dispatcher; if anything else changes, the abstraction failed",
        "\"Different backoff per channel — SMS retries fast, email slow\" — RetryPolicy is already a strategy: move from one dispatcher-wide policy to per-channel policies; task carries channel name so lookup is trivial",
        "\"The email provider rate-limits us\" — decorate: a RateLimitedChannel wrapping any Channel (composes directly with the rate-limiter-library question); good answers wrap and requeue-on-throttle rather than blocking a worker",
        "\"No alert may be lost on crash\" — put the queue behind a store interface so in-memory swaps for a durable log; candidate should note this forces at-least-once and therefore idempotent sends keyed on notification id",
        "\"Users want digests — at most one email per 5 minutes\" — needs an aggregation stage between routing and enqueue; tests whether their pipeline has a seam there or whether publish() goes straight to the queue with no interception point",
        "\"Per-user ordering\" — per-key serialization in the worker pool (hash user to a lane); a good answer preserves the queue design and adds lane affinity rather than one global ordered queue"
      ],
      "commonMistakes": [
        "sleep(backoff) inside Channel::send or inside a worker — blocks a thread per pending retry instead of re-enqueueing with a due time",
        "Retry logic copy-pasted into each channel",
        "Retrying permanent failures forever because send() only returns bool",
        "publish() doing the send synchronously — the producer blocks on SMTP",
        "Unbounded queue with no backpressure answer",
        "No dead-letter path: exhausted notifications silently dropped",
        "Detached worker threads and no shutdown/drain story — destructor UB under questioning",
        "Making channels observers of the producer directly, so routing/preferences have nowhere to live"
      ],
      "skeleton": "using TimePoint = std::chrono::steady_clock::time_point;\nusing Duration  = std::chrono::steady_clock::duration;\n\nstruct Notification {\n    uint64_t    id;                          // dedup key -> at-least-once safe\n    std::string userId, topic, body;\n    int         severity;\n};\n\nenum class SendStatus { Ok, RetryableError, PermanentError };\n\nclass Channel {                              // passive transport: no retries/threads/sleeps\npublic:\n    virtual ~Channel() = default;\n    virtual std::string name() const = 0;\n    virtual SendStatus send(const Notification&) = 0;   // one synchronous attempt\n};\nclass EmailChannel : public Channel { /* smtp client */ };\nclass SmsChannel   : public Channel { /* sms gateway */ };\n\nclass RetryPolicy {\npublic:\n    virtual ~RetryPolicy() = default;\n    virtual std::optional<Duration> nextDelay(int attempt) const = 0; // nullopt = dead-letter\n};\nclass ExponentialBackoff : public RetryPolicy { /* base, factor, cap, maxAttempts */ };\n\nclass DeadLetterSink {\npublic:\n    virtual ~DeadLetterSink() = default;\n    virtual void onDead(const Notification&, const std::string& channel) = 0;\n};\n\nclass SubscriptionRegistry {                 // topic -> users, user -> channels\npublic:\n    void subscribe(const std::string& userId, const std::string& topic);\n    void setChannels(const std::string& userId, std::vector<std::string> channels);\n    std::vector<std::pair<std::string, std::string>>   // (userId, channelName)\n    route(const Notification&) const;\nprivate:\n    std::unordered_map<std::string, std::vector<std::string>> topicSubs_, userChannels_;\n};\n\nclass Dispatcher {                           // OWNS queue + workers; channels stay dumb\npublic:\n    Dispatcher(std::vector<std::unique_ptr<Channel>> channels,\n               std::unique_ptr<RetryPolicy> retry,\n               std::unique_ptr<DeadLetterSink> dlq,\n               size_t workerCount);\n    ~Dispatcher();                           // shutdown(drain=true), join workers\n    void publish(Notification n);            // route -> enqueue tasks; non-blocking\n    void shutdown(bool drain);\nprivate:\n    struct Task { Notification n; std::string channel; int attempt; TimePoint due; };\n    struct DueLater { bool operator()(const Task& a, const Task& b) const; };\n    std::priority_queue<Task, std::vector<Task>, DueLater> queue_; // min-heap on due:\n                                             // retries re-enqueued, workers never sleep\n    std::mutex mu_;\n    std::condition_variable cv_;\n    std::vector<std::thread> workers_;\n    std::unordered_map<std::string, std::unique_ptr<Channel>> channels_;\n    std::unique_ptr<RetryPolicy> retry_;\n    std::unique_ptr<DeadLetterSink> dlq_;\n    SubscriptionRegistry registry_;\n    bool stopping_ = false;\n    void workerLoop();                       // pop when due; send; Ok/dead/re-enqueue\n};"
    }
  }
];

export function getOopQuestion(id: string): OopQuestion | undefined {
  return OOP_BANK.find((q) => q.id === id);
}

export function randomOopQuestion(): OopQuestion {
  return OOP_BANK[Math.floor(Math.random() * OOP_BANK.length)];
}

export function listOopQuestions(): { id: string; title: string; difficulty: OopDifficulty; asks: string; patterns: string[] }[] {
  return OOP_BANK.map((q) => ({ id: q.id, title: q.title, difficulty: q.difficulty, asks: q.asks, patterns: q.patterns }));
}

// System-prompt block: the selected question's private ground truth.
export function oopBriefBlock(q: OopQuestion): string {
  const b = q.brief;
  return [
    `SELECTED OOP QUESTION: ${q.title} (${q.difficulty}; ${q.asks}; expected pattern signal: ${q.patterns.join(', ')})`,
    `You have already stated the prompt: "${q.prompt}"`,
    '',
    'PRIVATE GROUND TRUTH — release one fact at a time on request, never volunteer, never enumerate:',
    `Requirements a good candidate extracts by asking:\n${b.requirements.map((r) => `- ${r}`).join('\n')}`,
    `Expected decomposition (core classes and relationships):\n${b.entities.map((e) => `- ${e}`).join('\n')}`,
    `Key interfaces and why they're shaped that way:\n${b.interfaces.map((i) => `- ${i}`).join('\n')}`,
    `Pattern notes (what using or missing each signals):\n${b.patternNotes.map((p) => `- ${p}`).join('\n')}`,
    `Extension asks — deploy 1-2 once the design has shape; the grade is whether the change stays local:\n${b.extensions.map((e) => `- ${e}`).join('\n')}`,
    `Common mistakes to watch for (log silently, surface in debrief):\n${b.commonMistakes.map((m) => `- ${m}`).join('\n')}`,
    `Reference skeleton (PRIVATE — for judging their skeleton, never to be shown or dictated):\n${b.skeleton}`,
  ].join('\n\n');
}
