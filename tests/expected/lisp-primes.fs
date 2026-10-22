0 value count-primes.limit
create count-primes.sieve 100 cells allot
0 value count-primes.count
0 value count-primes.j
: count-primes
  to count-primes.limit
  count-primes.sieve 100 cells erase
  0 to count-primes.count
  count-primes.limit 2 max 2 ?do
    count-primes.sieve i cells + @ 0= if
      count-primes.count 1+ to count-primes.count
      i i * to count-primes.j
      begin count-primes.j count-primes.limit < while
        1 count-primes.sieve count-primes.j cells + !
        count-primes.j i + to count-primes.j
      repeat
    then
  loop
  count-primes.count ;

:noname
  ." Primes below 100: " 100 count-primes 0 .r cr
  ." Primes below 30: " 30 count-primes 0 .r cr
; execute
