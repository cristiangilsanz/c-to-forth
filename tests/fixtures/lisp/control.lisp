(defun classify (n)
  (case n
    (0 (format t "zero~%"))
    ((1 2 3) (format t "small~%"))
    (otherwise (format t "large~%"))))

(defun first-multiple (n k)
  (dotimes (i 100)
    (when (and (> i 0) (zerop (mod (* i n) k)))
      (return-from first-multiple (* i n))))
  0)

(defun sign (n)
  (cond ((< n 0) -1)
        ((> n 0) 1)
        (t 0)))

(defun countdown (n)
  (loop
    (when (zerop n) (return))
    (format t "~d " n)
    (decf n))
  (terpri))

(defun skip-threes ()
  (dotimes (i 10)
    (block next
      (when (zerop (rem i 3)) (return-from next))
      (format t "~d" i)))
  (terpri))

(classify 0)
(classify 2)
(classify 9)
(format t "~d ~d ~d~%" (sign -5) (sign 0) (sign 8))
(format t "~d~%" (first-multiple 6 4))
(countdown 5)
(skip-threes)
(let ((x 10))
  (format t "~d ~d~%" (prog1 x (incf x)) x))
(unless (> 1 2) (format t "unless works~%"))
