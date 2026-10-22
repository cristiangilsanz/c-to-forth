(defun fib (n)
  (when (< n 2) (return-from fib n))
  (+ (fib (- n 1)) (fib (- n 2))))

(defun main ()
  (format t "Fibonacci:")
  (dotimes (i 15)
    (format t " ~d" (fib i)))
  (format t "~%"))

(main)
