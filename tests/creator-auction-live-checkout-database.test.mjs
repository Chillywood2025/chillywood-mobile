import test from 'node:test';
import {withQualifiedAuctionFixture} from './helpers/auction-checkout-fixture.mjs';

for(const mode of ['test','live']) for(const lane of ['event','room']) test(`synthetic ${mode} ${lane} auction requires mode controls, exact qualified platform contract and canonical paid access`,{timeout:240000},async()=>{
 await withQualifiedAuctionFixture({mode,lane});
});

for(const mode of ['test','live']) test(`synthetic ${mode} Party admission auction preserves exact room source`,{timeout:240000},async()=>{
 await withQualifiedAuctionFixture({mode,lane:'room',sourceKind:'party_admission'});
});
