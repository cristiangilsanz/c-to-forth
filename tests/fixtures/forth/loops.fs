: stars 0 ?do 42 emit loop ;
: triangle 1+ 1 ?do i stars cr loop ;
4 triangle
: evens 10 0 ?do i . 2 +loop cr ;
evens
: countdown begin dup . 1- dup 0= until drop cr ;
5 countdown
: first-square-above ( n -- k ) 1 begin 2dup dup * < 0= while 1+ repeat nip ;
50 first-square-above . cr
: nested 3 0 do 2 0 do j 10 * i + . loop loop cr ;
nested
: find-seven 100 0 do i 7 = if i . leave then loop cr ;
find-seven
: two-exits 0 begin dup 10 < while dup 5 <> while 1+ repeat ." stopped at " . else ." ran out" drop then cr ;
two-exits
