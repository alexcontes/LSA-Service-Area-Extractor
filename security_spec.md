# Security Spec for LSA History

## Data Invariants
1. A search/push must have a valid `userId` and `accountId`.
2. `accountId` must be present in every document to allow filtered queries.
3. Timestamps must be server-generated.

## The Dirty Dozen Payloads
(Targeting `/history/searches`)
1. **The Poison ID**: Create a search with a 2MB string as ID. -> DENIED
2. **The Spoof User**: User A trying to write a search for User B (once auth is added). -> DENIED
3. **The Shadow Field**: Adding `isVerified: true` to a search object. -> DENIED
4. **The Time Warp**: Providing a `timestamp` from 1999. -> DENIED
5. **The Missing Account**: Writing a search without an `accountId`. -> DENIED
6. **The Giant Array**: A search with 10,000 area results in a single document (limit size). -> DENIED
7. **The Type Switch**: Sending `resultCount` as a string "5". -> DENIED
8. **The Orphan Push**: A push with a non-existent campaign ID format. -> DENIED
9. **The Blank Search**: Empty areas array. -> DENIED
10. **The Negative Income**: ZIP code with -100 income. -> DENIED
11. **The Over-sized Area Name**: Area name with 500 characters. -> DENIED
12. **The Unauthorized Read**: Querying searches from another `accountId`. -> DENIED
