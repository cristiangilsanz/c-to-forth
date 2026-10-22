(defun fib (n)
  (if (< n 2)
      n
      (+ (fib (- n 1)) (fib (- n 2)))))

(defun hanoi (disks)
  (if (= disks 0)
      0
      (+ 1 (* 2 (hanoi (1- disks))))))

(defun power-of-two-p (n)
  (and (plusp n) (zerop (logand n (1- n)))))

(print (fib 20))
(print (hanoi 10))
(print (gcd 1071 462))
(print (expt 2 20))
(print (max 3 9 4))
(print (ash 1 10))
(print (ash -20 -2))
(print (power-of-two-p 64))
(print (power-of-two-p 65))
(terpri)
(prin1 (min 3 9 4))
(princ " ")
(princ (abs -7))
(terpri)
