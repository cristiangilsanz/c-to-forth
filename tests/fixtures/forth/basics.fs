: square ( n -- n*n ) dup * ;
: cube dup square * ;
5 square . 3 cube . cr
2 3 + 4 * . cr
-7 2 / . -7 2 mod . 7 3 /mod . . cr
1 2 3 rot . . . cr
10 20 swap - . cr
1 2 2dup + . . . cr
.( Hello from interpret mode) cr
hex 255 . decimal 255 . cr
$10 . #10 . %101 . cr
char A . cr
3 4 max . 3 4 min . -5 abs . cr
1 2 < . 2 1 < . 0 0= . cr
