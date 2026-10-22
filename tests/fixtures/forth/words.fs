variable counter
: bump 1 counter +! ;
bump bump bump counter @ . cr
10 constant ten
ten ten * . cr
0 value total
: add total + to total ;
5 add 7 add total . cr
create numbers 1 , 2 , 3 , 4 ,
: sum-table 0 4 0 do numbers i cells + @ + loop ;
sum-table . cr
defer greet
: hello ." hello" ;
' hello is greet
greet cr
:noname ." anonymous" ; execute cr
: grade case 1 of ." one " endof 2 of ." two " endof ." many " endcase ;
1 grade 2 grade 9 grade cr
s" a string" type cr
: shout s" HEY" type ;
shout cr
3 spaces ." indented" cr
1 2 3 .s cr
depth . cr
